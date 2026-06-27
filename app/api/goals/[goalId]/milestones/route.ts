import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet, KEYS } from "@/lib/kv";
import { requireUserId, unauthorized } from "@/lib/auth";
import { breakdownGoalIntoMilestones } from "@/lib/planner";
import { findGoal, genId } from "@/lib/goals";
import { EMPTY_PROFILE, Milestone, Profile } from "@/lib/types";

// Generate (or regenerate) the AI's proposed milestones for a goal.
// Stored immediately with status "proposed" so the user can edit them
// in place before confirming.
export async function POST(
  req: NextRequest,
  { params }: { params: { goalId: string } }
) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const profile = (await kvGet<Profile>(KEYS.profile(userId))) ?? EMPTY_PROFILE;
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
  })) as Milestone[];

  profile.updatedAt = new Date().toISOString();
  await kvSet(KEYS.profile(userId), profile);

  return NextResponse.json(goal);
}

// Save the user's confirmed/edited milestone list. Confirming here doesn't
// generate steps yet — that happens per-milestone via the steps endpoint,
// starting with the first one.
export async function PUT(
  req: NextRequest,
  { params }: { params: { goalId: string } }
) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const body = await req.json();
  const rawMilestones: unknown[] = Array.isArray(body.milestones)
    ? body.milestones
    : [];

  const profile = (await kvGet<Profile>(KEYS.profile(userId))) ?? EMPTY_PROFILE;
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
      } as Milestone;
    })
    .filter((m) => m.text.length > 0);

  goal.status = goal.status === "completed" ? goal.status : "active";

  profile.updatedAt = new Date().toISOString();
  await kvSet(KEYS.profile(userId), profile);

  return NextResponse.json(goal);
}
