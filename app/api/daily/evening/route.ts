import { NextRequest, NextResponse } from "next/server";
import { loadProfile, saveProfile, loadDailyLog, saveDailyLog } from "@/lib/db";
import { requireUserId, unauthorized } from "@/lib/auth";
import { adjustPlanFromDailyResults } from "@/lib/planner";
import {
  countCompletedGoals,
  countCompletedMilestones,
  recomputeStatuses,
} from "@/lib/goals";
import { todayKey } from "@/lib/date";
import { recordActivity } from "@/lib/stats";
import {
  DailyLog,
  DailyResult,
  DailyResultStatus,
  EMPTY_DAILY_LOG,
} from "@/lib/types";

// Signed-in callers: unchanged -- loads/updates the profile and today's log
// in Supabase, then calls the AI for the evening reaction note.
//
// Guests have nothing server-side to load. The client has already updated
// step statuses and recomputed completion locally (recomputeStatuses() from
// lib/goals.ts, same pure function used here), so it just sends the recap
// text it built and gets back the bare adjustment note -- no persistence.
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  const body = await req.json();

  if (!userId) {
    const recapText = typeof body.recapText === "string" ? body.recapText : "";
    if (!recapText.trim()) {
      return NextResponse.json({ adjustmentNote: "" });
    }
    try {
      const adjustmentNote = await adjustPlanFromDailyResults(recapText);
      return NextResponse.json({ adjustmentNote });
    } catch {
      return NextResponse.json({ adjustmentNote: "" });
    }
  }

  const date = todayKey();
  const rawResults: unknown[] = Array.isArray(body.results) ? body.results : [];

  const log = (await loadDailyLog(userId, date)) ?? EMPTY_DAILY_LOG(date);

  const validStepIds = new Set(log.focusItems.map((f) => f.stepId));

  const results: DailyResult[] = rawResults
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({
      stepId: typeof r.stepId === "string" ? r.stepId : "",
      status: (r.status === "done" || r.status === "blocked" || r.status === "skipped"
        ? r.status
        : "skipped") as DailyResultStatus,
      note: typeof r.note === "string" ? r.note.trim() : "",
    }))
    .filter((r) => validStepIds.has(r.stepId));

  const profile = await loadProfile(userId);

  for (const result of results) {
    for (const goal of profile.goals) {
      for (const milestone of goal.milestones) {
        const step = milestone.steps.find((s) => s.id === result.stepId);
        if (step) step.status = result.status;
      }
    }
  }

  recomputeStatuses(profile);
  profile.updatedAt = new Date().toISOString();
  await saveProfile(userId, profile);

  const recapLines = log.focusItems.map((item) => {
    const r = results.find((x) => x.stepId === item.stepId);
    return `- [${item.goalText} / ${item.milestoneText}] ${item.stepText} -> ${
      r ? r.status : "no response"
    }${r?.note ? ` (${r.note})` : ""}`;
  });

  let adjustmentNote = "";
  if (recapLines.length > 0) {
    try {
      adjustmentNote = await adjustPlanFromDailyResults(recapLines.join("\n"));
    } catch {
      adjustmentNote = "";
    }
  }

  const updatedLog: DailyLog = {
    ...log,
    results,
    adjustmentNote,
    eveningCompletedAt: new Date().toISOString(),
  };
  await saveDailyLog(userId, updatedLog);

  const stepsCompletedToday = results.filter((r) => r.status === "done").length;
  await recordActivity(userId, date, {
    stepsCompletedToday,
    totalGoalsCompleted: countCompletedGoals(profile),
    totalMilestonesCompleted: countCompletedMilestones(profile),
  });

  return NextResponse.json({ log: updatedLog, profile });
}
