import { NextRequest, NextResponse } from "next/server";
import { loadProfile, saveProfile } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { breakdownMilestoneIntoSteps } from "@/lib/planner";
import {
  buildStepsFromInput,
  findGoal,
  findMilestone,
  genId,
  RawStepInput,
} from "@/lib/goals";
import { Step } from "@/lib/types";

// Generate (or regenerate) the AI's proposed steps for one milestone.
// Used for the initial automatic generation (now triggered for every
// milestone right after confirming) as well as a manual "Regenerate" for
// a single milestone.
//
// Guests send { goalText, milestoneText } and get back a bare { steps }
// with no persistence -- the client merges that into its own
// localStorage-held Profile (lib/guestStore.ts).
export async function POST(
  req: NextRequest,
  { params }: { params: { goalId: string; milestoneId: string } }
) {
  const userId = await requireUserId();

  if (!userId) {
    const body = await req.json().catch(() => ({}));
    const goalText = typeof body.goalText === "string" ? body.goalText.trim() : "";
    const milestoneText =
      typeof body.milestoneText === "string" ? body.milestoneText.trim() : "";
    if (!goalText || !milestoneText) {
      return NextResponse.json(
        { error: "Missing goalText or milestoneText." },
        { status: 400 }
      );
    }

    let proposed;
    try {
      proposed = await breakdownMilestoneIntoSteps(goalText, milestoneText);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
    if (proposed.length === 0) {
      return NextResponse.json(
        { error: "Couldn't generate steps. Try again." },
        { status: 500 }
      );
    }

    const ids = proposed.map(() => genId("step"));
    const steps: Step[] = proposed.map((s, i) => ({
      id: ids[i],
      text: s.text,
      resource: s.resource,
      output: s.output,
      estimatedHours: s.estimatedHours,
      dependencies: s.dependsOnIndexes
        .filter((idx) => idx >= 0 && idx < ids.length && idx !== i)
        .map((idx) => ids[idx]),
      status: "pending",
      order: i,
      notes: "",
    })) as Step[];

    return NextResponse.json({ steps });
  }

  const profile = await loadProfile(userId);
  const goal = findGoal(profile, params.goalId);
  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  const milestone = findMilestone(goal, params.milestoneId);
  if (!milestone)
    return NextResponse.json({ error: "Milestone not found" }, { status: 404 });

  let proposed;
  try {
    proposed = await breakdownMilestoneIntoSteps(goal.text, milestone.text);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (proposed.length === 0) {
    return NextResponse.json(
      { error: "Couldn't generate steps. Try again." },
      { status: 500 }
    );
  }

  const ids = proposed.map(() => genId("step"));
  milestone.steps = proposed.map((s, i) => ({
    id: ids[i],
    text: s.text,
    resource: s.resource,
    output: s.output,
    estimatedHours: s.estimatedHours,
    dependencies: s.dependsOnIndexes
      .filter((idx) => idx >= 0 && idx < ids.length && idx !== i)
      .map((idx) => ids[idx]),
    status: "pending",
    order: i,
    notes: "",
  })) as Step[];

  profile.updatedAt = new Date().toISOString();
  await saveProfile(userId, profile);

  return NextResponse.json(milestone);
}

// Confirm/edit the proposed steps and activate this milestone (and its
// goal) for the daily loop. Pure validation/cleaning, no AI call -- so
// guests never need to hit this route at all; the client runs the same
// buildStepsFromInput() helper (lib/goals.ts) directly against its
// localStorage Profile instead.
export async function PUT(
  req: NextRequest,
  { params }: { params: { goalId: string; milestoneId: string } }
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in with Google or LinkedIn to use this." },
      { status: 401 }
    );
  }

  const body = await req.json();
  const rawSteps: RawStepInput[] = Array.isArray(body.steps) ? body.steps : [];

  const profile = await loadProfile(userId);
  const goal = findGoal(profile, params.goalId);
  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  const milestone = findMilestone(goal, params.milestoneId);
  if (!milestone)
    return NextResponse.json({ error: "Milestone not found" }, { status: 404 });

  milestone.steps = buildStepsFromInput(milestone.steps, rawSteps);
  milestone.status = "confirmed";
  goal.status = goal.status === "completed" ? goal.status : "active";

  profile.updatedAt = new Date().toISOString();
  await saveProfile(userId, profile);

  return NextResponse.json({ goal, milestone });
}
