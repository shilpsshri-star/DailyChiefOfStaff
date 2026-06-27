// Pure helper functions over the Goal -> Milestone -> Step tree. No I/O here
// — API routes load the Profile from KV, run these helpers, then save it back.

import { FocusCandidate } from "./planner";
import { Goal, Milestone, Profile, Step } from "./types";

export function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
// confirmed milestone that isn't completed yet. Returns null if every
// confirmed milestone is done, or none are confirmed yet.
export function getActiveMilestone(goal: Goal): Milestone | null {
  const confirmed = goal.milestones
    .filter((m) => m.status !== "proposed")
    .sort((a, b) => a.order - b.order);
  return confirmed.find((m) => m.status !== "completed") ?? null;
}

function isStepUnblocked(milestone: Milestone, step: Step): boolean {
  if (step.dependencies.length === 0) return true;
  const byId = new Map(milestone.steps.map((s) => [s.id, s]));
  return step.dependencies.every((depId) => byId.get(depId)?.status === "done");
}

// Steps eligible to be picked for today's focus: belong to the active
// milestone of an active goal, not already done/active, and unblocked.
export function getCandidateSteps(profile: Profile): FocusCandidate[] {
  const candidates: FocusCandidate[] = [];
  for (const goal of profile.goals) {
    if (goal.status !== "active") continue;
    const milestone = getActiveMilestone(goal);
    if (!milestone || milestone.steps.length === 0) continue;
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
