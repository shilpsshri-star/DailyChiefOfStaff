// Pure helper functions over the Goal -> Milestone -> Step tree. No I/O here
// -- API routes load the Profile from storage, run these helpers, then save
// it back. Also safe to import from client ("use client") code for guest
// mode: nothing in this file touches the network, Supabase, or the
// Anthropic client (the import from "./planner" below is type-only and is
// erased at compile time).

import { FocusCandidate } from "./planner";
import { DailyLog, Goal, Milestone, Profile, Step } from "./types";

export function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function findGoal(profile: Profile, goalId: string): Goal | undefined {
  return profile.goals.find((g) => g.id === goalId);
}

export function findMilestone(
  goal: Goal,
  milestoneId: string
): Milestone | undefined {
  return goal.milestones.find((m) => m.id === milestoneId);
}

// The milestone currently "in progress" for a goal: the lowest-order
// confirmed milestone that isn't completed yet. Used for UI sequencing
// ("here's what's next"). Returns null if every confirmed milestone is
// done, or none are confirmed yet.
export function getActiveMilestone(goal: Goal): Milestone | null {
  const confirmed = goal.milestones
    .filter((m) => m.status !== "proposed")
    .sort((a, b) => a.order - b.order);
  return confirmed.find((m) => m.status !== "completed") ?? null;
}

// All confirmed, not-yet-completed milestones for a goal, in order. Since
// steps are generated for every milestone up front (not just the first),
// the daily loop can draw candidates from any of them, not only the single
// "active" one.
export function getOpenMilestones(goal: Goal): Milestone[] {
  return goal.milestones
    .filter((m) => m.status === "confirmed")
    .sort((a, b) => a.order - b.order);
}

function isStepUnblocked(milestone: Milestone, step: Step): boolean {
  if (step.dependencies.length === 0) return true;
  const byId = new Map(milestone.steps.map((s) => [s.id, s]));
  return step.dependencies.every((depId) => byId.get(depId)?.status === "done");
}

// Steps eligible to be picked for today's focus: belong to any confirmed,
// not-yet-completed milestone of any active goal, not already done/active,
// and unblocked. Pulled from every open milestone across every active goal
// so the daily loop isn't limited to whichever single milestone happens to
// be "first in line."
export function getCandidateSteps(profile: Profile): FocusCandidate[] {
  const candidates: FocusCandidate[] = [];
  for (const goal of profile.goals) {
    if (goal.status !== "active") continue;
    for (const milestone of getOpenMilestones(goal)) {
      if (milestone.steps.length === 0) continue;
      for (const step of milestone.steps) {
        if (step.status === "done" || step.status === "active") continue;
        if (!isStepUnblocked(milestone, step)) continue;
        candidates.push({
          stepId: step.id,
          goalText: goal.text,
          milestoneText: milestone.text,
          stepText: step.text,
          output: step.output,
        });
      }
    }
  }
  return candidates;
}

export interface RecomputeResult {
  newlyCompletedMilestones: number;
  newlyCompletedGoals: number;
}

// After steps change status, roll completion up: milestone completes when
// every one of its steps is done; goal completes when every milestone that
// has been confirmed is completed and there are no more proposed milestones
// left to confirm.
export function recomputeStatuses(profile: Profile): RecomputeResult {
  let newlyCompletedMilestones = 0;
  let newlyCompletedGoals = 0;

  for (const goal of profile.goals) {
    for (const milestone of goal.milestones) {
      if (milestone.status === "confirmed" && milestone.steps.length > 0) {
        const allDone = milestone.steps.every((s) => s.status === "done");
        if (allDone) {
          milestone.status = "completed";
          newlyCompletedMilestones += 1;
        }
      }
    }

    if (goal.status === "active" && goal.milestones.length > 0) {
      const allConfirmedDone = goal.milestones.every(
        (m) => m.status === "completed"
      );
      if (allConfirmedDone) {
        goal.status = "completed";
        newlyCompletedGoals += 1;
      }
    }
  }

  return { newlyCompletedMilestones, newlyCompletedGoals };
}

export function countCompletedGoals(profile: Profile): number {
  return profile.goals.filter((g) => g.status === "completed").length;
}

export function countCompletedMilestones(profile: Profile): number {
  return profile.goals.reduce(
    (sum, g) => sum + g.milestones.filter((m) => m.status === "completed").length,
    0
  );
}

// ---------------------------------------------------------------------------
// Shared step-cleaning logic for the "confirm steps" action. Pure, so the
// signed-in API route (app/api/goals/[goalId]/milestones/[milestoneId]/steps
// PUT handler) and the guest-mode client path (which never hits that route,
// since this step needs no AI call) both call this same function instead of
// maintaining two copies of the validation rules.
// ---------------------------------------------------------------------------

export interface RawStepInput {
  id?: string;
  text?: string;
  resource?: string;
  output?: string;
  estimatedHours?: number;
  dependencies?: string[];
}

export function buildStepsFromInput(existing: Step[], raw: RawStepInput[]): Step[] {
  const existingById = new Map(existing.map((s) => [s.id, s]));

  const cleaned = raw
    .map((s) => {
      const prior = s.id ? existingById.get(s.id) : undefined;
      return {
        id: prior?.id ?? s.id ?? genId("step"),
        text: (s.text ?? prior?.text ?? "").trim(),
        resource: (s.resource ?? prior?.resource ?? "").trim(),
        output: (s.output ?? prior?.output ?? "").trim(),
        estimatedHours:
          typeof s.estimatedHours === "number" && s.estimatedHours > 0
            ? Math.round(s.estimatedHours * 4) / 4
            : prior?.estimatedHours ?? 1,
        dependencies: Array.isArray(s.dependencies)
          ? s.dependencies
          : prior?.dependencies ?? [],
        status: prior?.status ?? "pending",
        notes: prior?.notes ?? "",
      };
    })
    .filter((s) => s.text.length > 0);

  const validIds = new Set(cleaned.map((s) => s.id));

  return cleaned.map((s, i) => ({
    id: s.id,
    text: s.text,
    resource: s.resource,
    output: s.output,
    estimatedHours: s.estimatedHours,
    dependencies: s.dependencies.filter((d) => validIds.has(d) && d !== s.id),
    status: s.status,
    order: i,
    notes: s.notes,
  })) as Step[];
}

// ---------------------------------------------------------------------------
// Shared weekly-recap builder, used by the signed-in /api/weekly GET route
// and by the guest-mode client path (which builds the same recap text
// locally from localStorage data, then POSTs just the recap string to
// /api/weekly for the stateless AI call).
// ---------------------------------------------------------------------------

export function buildWeekRecap(profile: Profile, logs: DailyLog[]): string {
  const goalLines = profile.goals.map((g) => {
    const ms = g.milestones
      .map(
        (m) =>
          `  - Milestone: ${m.text} [${m.status}] (${
            m.steps.filter((s) => s.status === "done").length
          }/${m.steps.length} steps done)`
      )
      .join("\n");
    return `Goal: ${g.text} [${g.status}]\n${ms || "  (no milestones yet)"}`;
  });

  const dayLines = logs.flatMap((log) =>
    log.results.map((r) => {
      const item = log.focusItems.find((f) => f.stepId === r.stepId);
      return `${log.date}: ${item ? item.stepText : r.stepId} -> ${r.status}${
        r.note ? ` (${r.note})` : ""
      }`;
    })
  );

  return [
    "GOALS AND PROGRESS:",
    goalLines.join("\n\n") || "(no goals yet)",
    "",
    "LAST 7 DAYS OF ACTIVITY:",
    dayLines.join("\n") || "(no daily activity logged this week)",
  ].join("\n");
}
