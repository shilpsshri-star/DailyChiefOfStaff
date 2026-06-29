import { NextRequest, NextResponse } from "next/server";
import { loadProfile, saveProfile } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { breakdownGoalIntoMilestones, breakdownMilestoneIntoSteps } from "@/lib/planner";
import { findGoal, genId } from "@/lib/goals";
import { Milestone, Step } from "@/lib/types";

// Generate (or regenerate) the AI's proposed milestones for a goal.
// Stored immediately with status "proposed" so the user can edit them
// in place before confirming.
//
// Signed-in callers load the goal from Supabase as before. Guests have no
// server-side profile to load from, so they send the goal's text directly
// in the body and get back a bare { milestones } array with no
// persistence -- the client merges that into its own localStorage-held
// Profile (lib/guestStore.ts).
export async function POST(
  req: NextRequest,
  { params }: { params: { goalId: string } }
) {
  const userId = await requireUserId();
  const body = await req.json().catch(() => ({}));

  const goalText = userId ? undefined : typeof body.goalText === "string" ? body.goalText.trim() : "";

  if (!userId) {
    if (!goalText) {
      return NextResponse.json({ error: "Missing goalText." }, { status: 400 });
    }
    let proposed;
    try {
      proposed = await breakdownGoalIntoMilestones(goalText);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
    if (proposed.length === 0) {
      return NextResponse.json(
        { error: "Couldn't generate milestones. Try again." },
        { status: 500 }
      );
    }
    const milestones: Milestone[] = proposed.map((m, i) => ({
      id: genId("ms"),
      text: m.text,
      order: i,
      status: "proposed",
      steps: [],
      targetDate: null,
    })) as Milestone[];
    return NextResponse.json({ milestones });
  }

  const profile = await loadProfile(userId);
  const goal = findGoal(profile, params.goalId);
  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

  let proposed;
  try {
    proposed = await breakdownGoalIntoMilestones(goal.text);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (proposed.length === 0) {
    return NextResponse.json(
      { error: "Couldn't generate milestones. Try again." },
      { status: 500 }
    );
  }

  goal.milestones = proposed.map((m, i) => ({
    id: genId("ms"),
    text: m.text,
    order: i,
    status: "proposed",
    steps: [],
    targetDate: null,
  })) as Milestone[];

  profile.updatedAt = new Date().toISOString();
  await saveProfile(userId, profile);

  return NextResponse.json(goal);
}

function stepsFromProposed(proposed: Awaited<ReturnType<typeof breakdownMilestoneIntoSteps>>): Step[] {
  const ids = proposed.map(() => genId("step"));
  return proposed.map((s, i) => ({
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
}

// Save the user's confirmed/edited milestone list, then immediately
// generate steps for EVERY milestone (5-7 concrete steps each, with a
// resource, a deliverable output, and an hour estimate) -- not just the
// first one -- so the daily loop has real candidates across the whole
// goal right away instead of only after working through milestones in
// strict sequence.
//
// Guests send { goalText, milestones } and get back a bare
// { milestones, goalStatus } with no persistence -- the client merges
// that into its own localStorage Profile.
export async function PUT(
  req: NextRequest,
  { params }: { params: { goalId: string } }
) {
  const userId = await requireUserId();
  const body = await req.json();
  const rawMilestones: unknown[] = Array.isArray(body.milestones)
    ? body.milestones
    : [];

  if (!userId) {
    const goalText = typeof body.goalText === "string" ? body.goalText.trim() : "";
    if (!goalText) {
      return NextResponse.json({ error: "Missing goalText." }, { status: 400 });
    }

    const milestones: Milestone[] = rawMilestones
      .filter(
        (m): m is { id?: unknown; text?: unknown } =>
          typeof m === "object" && m !== null
      )
      .map((m, i) => ({
        id: typeof m.id === "string" ? m.id : genId("ms"),
        text: typeof m.text === "string" ? m.text.trim() : "",
        order: i,
        status: "confirmed",
        steps: [],
        targetDate: null,
      }))
      .filter((m) => m.text.length > 0) as Milestone[];

    if (milestones.length > 0) {
      const results = await Promise.all(
        milestones.map((m) => breakdownMilestoneIntoSteps(goalText, m.text))
      );
      milestones.forEach((m, i) => {
        if (results[i].length > 0) m.steps = stepsFromProposed(results[i]);
      });
    }

    return NextResponse.json({ milestones, goalStatus: "active" });
  }

  const profile = await loadProfile(userId);
  const goal = findGoal(profile, params.goalId);
  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

  const existingById = new Map(goal.milestones.map((m) => [m.id, m]));

  goal.milestones = rawMilestones
    .filter(
      (m): m is { id?: unknown; text?: unknown } =>
        typeof m === "object" && m !== null
    )
    .map((m, i) => {
      const prior = typeof m.id === "string" ? existingById.get(m.id) : undefined;
      return {
        id: prior?.id ?? genId("ms"),
        text: typeof m.text === "string" ? m.text.trim() : prior?.text ?? "",
        order: i,
        status: "confirmed",
        steps: prior?.steps ?? [],
        targetDate:
          typeof (m as { targetDate?: unknown }).targetDate === "string"
            ? (m as { targetDate?: string }).targetDate ?? null
            : prior?.targetDate ?? null,
      } as Milestone;
    })
    .filter((m) => m.text.length > 0);

  goal.status = goal.status === "completed" ? goal.status : "active";

  // Generate steps for every milestone that doesn't already have any yet
  // (so re-confirming after an edit doesn't clobber steps already worked
  // on). Run the AI calls in parallel since there can be up to 5.
  const needsSteps = goal.milestones.filter((m) => m.steps.length === 0);
  if (needsSteps.length > 0) {
    const results = await Promise.all(
      needsSteps.map((m) => breakdownMilestoneIntoSteps(goal.text, m.text))
    );
    needsSteps.forEach((m, i) => {
      const proposed = results[i];
      if (proposed.length > 0) {
        m.steps = stepsFromProposed(proposed);
      }
    });
  }

  profile.updatedAt = new Date().toISOString();
  await saveProfile(userId, profile);

  return NextResponse.json(goal);
}
