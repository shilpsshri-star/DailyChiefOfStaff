#!/usr/bin/env node
// Standalone MCP server exposing this app's own goal/milestone/step data as
// tools, so any MCP client (e.g. Claude Desktop) can read and update your
// plan in natural language -- "what's my focus today", "mark step X done",
// "push milestone Y's date back a week" -- without opening the web app.
//
// This is a personal, single-user server, not a multi-tenant API: every
// call is scoped to the Clerk user id in MCP_USER_ID. There's no session
// here, just a fixed user id read from env, so don't expose this process
// to anyone but yourself -- it talks straight to Supabase with the service
// role key, the same as the Next.js API routes do.
//
// Reuses the exact same lib/db.ts, lib/goals.ts, and lib/planner.ts the web
// app uses -- this is the same Goal -> Milestone -> Step model and the same
// AI planning prompts, just exposed over MCP instead of HTTP.
//
// Run with: npm run mcp
// Then add it to your MCP client config (see README.md "MCP server" section).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadProfile, saveProfile } from "../lib/db";
import { findMilestone, getCandidateSteps, recomputeStatuses } from "../lib/goals";
import { pickDailyFocus } from "../lib/planner";
import { StepStatus } from "../lib/types";
import { createCalendarEventForMilestone } from "./calendar-client";

const USER_ID = process.env.MCP_USER_ID;
if (!USER_ID) {
  console.error(
    "Missing MCP_USER_ID env var -- set it to your Clerk user id " +
      "(open Supabase -> Table editor -> users, copy the `id` column for your row)."
  );
  process.exit(1);
}

const server = new McpServer({ name: "daily-chief-of-staff", version: "1.0.0" });

server.tool(
  "list_goals",
  "List every goal with its status and each milestone's progress (steps done/total, status, target date).",
  {},
  async () => {
    const profile = await loadProfile(USER_ID!);
    const goals = profile.goals.map((g) => ({
      id: g.id,
      text: g.text,
      status: g.status,
      milestones: g.milestones.map((m) => ({
        id: m.id,
        text: m.text,
        status: m.status,
        targetDate: m.targetDate,
        stepsDone: m.steps.filter((s) => s.status === "done").length,
        stepsTotal: m.steps.length,
      })),
    }));
    return { content: [{ type: "text" as const, text: JSON.stringify(goals, null, 2) }] };
  }
);

server.tool(
  "get_daily_focus",
  "Get the AI's top recommended steps to focus on today, across every active goal -- the same picker the web app's morning Daily Loop uses.",
  {},
  async () => {
    const profile = await loadProfile(USER_ID!);
    const candidates = getCandidateSteps(profile);
    if (candidates.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No unblocked steps available right now -- every active goal's open milestones are either fully done or have no steps generated yet.",
          },
        ],
      };
    }
    const picks = await pickDailyFocus(candidates, "");
    const byId = new Map(candidates.map((c) => [c.stepId, c]));
    const result = picks.map((p) => ({ ...byId.get(p.stepId), reasoning: p.reasoning }));
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "list_milestone_steps",
  "List every step (text, status, resource, output, hours, notes) for a given milestone id.",
  { milestoneId: z.string().describe("The milestone's id, from list_goals.") },
  async ({ milestoneId }) => {
    const profile = await loadProfile(USER_ID!);
    for (const g of profile.goals) {
      const m = findMilestone(g, milestoneId);
      if (m) {
        return { content: [{ type: "text" as const, text: JSON.stringify(m.steps, null, 2) }] };
      }
    }
    return {
      content: [{ type: "text" as const, text: `No milestone found with id "${milestoneId}".` }],
      isError: true,
    };
  }
);

server.tool(
  "set_step_status",
  "Set a step's status. Recomputes milestone/goal completion afterward, same as the web app's daily check-in.",
  {
    stepId: z.string().describe("The step's id, from list_milestone_steps."),
    status: z.enum(["pending", "active", "done", "blocked", "skipped"] as [StepStatus, ...StepStatus[]]),
  },
  async ({ stepId, status }) => {
    const profile = await loadProfile(USER_ID!);
    let foundText: string | undefined;
    for (const g of profile.goals) {
      for (const m of g.milestones) {
        const s = m.steps.find((s) => s.id === stepId);
        if (s) {
          s.status = status;
          foundText = s.text;
        }
      }
    }
    if (!foundText) {
      return {
        content: [{ type: "text" as const, text: `No step found with id "${stepId}".` }],
        isError: true,
      };
    }
    const { newlyCompletedMilestones, newlyCompletedGoals } = recomputeStatuses(profile);
    profile.updatedAt = new Date().toISOString();
    await saveProfile(USER_ID!, profile);
    return {
      content: [
        {
          type: "text" as const,
          text:
            `Step "${foundText}" set to ${status}.` +
            (newlyCompletedMilestones || newlyCompletedGoals
              ? ` ${newlyCompletedMilestones} milestone(s) and ${newlyCompletedGoals} goal(s) just completed.`
              : ""),
        },
      ],
    };
  }
);

server.tool(
  "set_milestone_target_date",
  "Set or clear a milestone's target date. Pass targetDate as null to clear it.",
  {
    milestoneId: z.string().describe("The milestone's id, from list_goals."),
    targetDate: z.string().nullable().describe("YYYY-MM-DD, or null to clear."),
  },
  async ({ milestoneId, targetDate }) => {
    const profile = await loadProfile(USER_ID!);
    let foundText: string | undefined;
    for (const g of profile.goals) {
      const m = findMilestone(g, milestoneId);
      if (m) {
        m.targetDate = targetDate;
        foundText = m.text;
      }
    }
    if (!foundText) {
      return {
        content: [{ type: "text" as const, text: `No milestone found with id "${milestoneId}".` }],
        isError: true,
      };
    }
    profile.updatedAt = new Date().toISOString();
    await saveProfile(USER_ID!, profile);

    let calendarNote = "";
    if (targetDate) {
      // Best-effort: an MCP *client* call out to Google's own Calendar MCP
      // server. Never let a calendar hiccup block the date save above --
      // it's already committed by the time this runs.
      const calendarResult = await createCalendarEventForMilestone(foundText, targetDate);
      calendarNote = ` Calendar sync: ${calendarResult.ok ? "event created. " : ""}${calendarResult.detail}`;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Target date ${targetDate ? `set to ${targetDate}` : "cleared"}.${calendarNote}`,
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Daily Chief of Staff MCP server running on stdio.");
}

main().catch((err) => {
  console.error("MCP server failed to start:", err);
  process.exit(1);
});
