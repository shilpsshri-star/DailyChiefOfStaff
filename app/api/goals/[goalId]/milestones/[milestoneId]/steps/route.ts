import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet, KEYS } from "@/lib/kv";
import { requireUserId, unauthorized } from "@/lib/auth";
import { breakdownMilestoneIntoSteps } from "@/lib/planner";
import { findGoal, findMilestone, genId } from "@/lib/goals";
import { EMPTY_PROFILE, Profile, Step } from "@/lib/types";

// Generate (or regenerate) the AI's proposed steps for one milestone.
export async function POST(
  req: NextRequest,
  { params }: { params: { goalId: string; milestoneId: string } }
) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const profile = (await kvGet<Profile>(KEYS.profile(userId))) ?? EMPTY_PROFILE;
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
    output: s.output,
    estimatedDays: s.estimatedDays,
    dependencies: s.dependsOnIndexes
      .filter((idx) => idx >= 0 && idx < ids.length && idx !== i)
      .map((idx) => ids[idx]),
    status: "pending",
    order: i,
  })) as Step[];

  profile.updatedAt = new Date().toISOString();
  await kvSet(KEYS.profile(userId), profile);

  return NextResponse.json(milestone);
}

// Confirm/edit the proposed steps and activate this milestone (and its
// goal) for the daily loop.
export async function PUT(
  req: NextRequest,
  { params }: { params: { goalId: string; milestoneId: string } }
) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const body = await req.json();
  const rawSteps: unknown[] = Array.isArray(body.steps) ? body.steps : [];

  const profile = (await kvGet<Profile>(KEYS.profile(userId))) ?? EMPTY_PROFILE;
  const goal = findGoal(profile, params.goalId);
  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  const milestone = findMilestone(goal, params.milestoneId);
  if (!milestone)
    return NextResponse.json({ error: "Milestone not found" }, { status: 404 });

  const existingById = new Map(milestone.steps.map((s) => [s.id, s]));

  // First pass: assign/keep ids so dependency-by-id references stay valid
  // even if the client edited text but kept the same id.
  const cleaned = rawSteps
    .filter(
      (s): s is Record<string, unknown> => typeof s === "object" && s !== null
    )
    .map((s) => {
      const prior =
        typeof s.id === "string" ? existingById.get(s.id) : undefined;
      return {
        id: prior?.id ?? (typeof s.id === "string" ? s.id : genId("step")),
        text: typeof s.text === "string" ? s.text.trim() : prior?.text ?? "",
        output:
          typeof s.output === "string" ? s.output.trim() : prior?.output ?? "",
        estimatedDays:
          typeof s.estimatedDays === "number" && s.estimatedDays > 0
            ? Math.round(s.estimatedDays)
            : prior?.estimatedDays ?? 1,
        dependencies: Array.isArray(s.dependencies)
          ? s.dependencies.filter((d: unknown) => typeof d === "string")
          : prior?.dependencies ?? [],
        status: prior?.status ?? "pending",
      };
    })
    .filter((s) => s.text.length > 0);

  const validIds = new Set(cleaned.map((s) => s.id));

  milestone.steps = cleaned.map((s, i) => ({
    id: s.id,
    text: s.text,
    output: s.output,
    estimatedDays: s.estimatedDays,
    dependencies: s.dependencies.filter((d) => validIds.has(d) && d !== s.id),
    status: s.status,
    order: i,
  })) as Step[];

  milestone.status = "confirmed";
  goal.status = goal.status === "completed" ? goal.status : "active";

  profile.updatedAt = new Date().toISOString();
  await kvSet(KEYS.profile(userId), profile);

  return NextResponse.json({ goal, milestone });
}
