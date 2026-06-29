import { NextRequest, NextResponse } from "next/server";
import { loadProfile, saveProfile } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { findGoal, findMilestone, recomputeStatuses } from "@/lib/goals";

// Set (or clear) a single milestone's user-chosen target date. Deliberately
// separate from the steps PUT (confirm/edit) endpoint -- this is a small,
// independent edit that shouldn't require re-validating the whole step
// list. Guests never hit this route; the client mutates its localStorage
// Profile directly (lib/guestStore.ts).
export async function PATCH(
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

  const body = await req.json().catch(() => ({}));
  const targetDate =
    typeof body.targetDate === "string" && body.targetDate.length > 0
      ? body.targetDate
      : null;

  const profile = await loadProfile(userId);
  const goal = findGoal(profile, params.goalId);
  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  const milestone = findMilestone(goal, params.milestoneId);
  if (!milestone)
    return NextResponse.json({ error: "Milestone not found" }, { status: 404 });

  milestone.targetDate = targetDate;
  profile.updatedAt = new Date().toISOString();
  await saveProfile(userId, profile);

  return NextResponse.json({ milestone });
}

// Delete a milestone entirely (and every step under it). There's no
// "removed" status in the data model -- this literally splices it out of
// goal.milestones, then re-numbers the remaining milestones' `order` by
// position so the carousel/sequencing logic (lib/goals.ts) keeps working.
// Also re-runs recomputeStatuses afterward in case removing this milestone
// means every remaining one is already done (e.g. you delete the one
// unfinished milestone left). Guests never hit this route; the client
// splices its localStorage Profile directly (see page.tsx).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { goalId: string; milestoneId: string } }
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in with Google or LinkedIn to use this." },
      { status: 401 }
    );
  }

  const profile = await loadProfile(userId);
  const goal = findGoal(profile, params.goalId);
  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  const milestone = findMilestone(goal, params.milestoneId);
  if (!milestone)
    return NextResponse.json({ error: "Milestone not found" }, { status: 404 });

  goal.milestones = goal.milestones
    .filter((m) => m.id !== params.milestoneId)
    .map((m, i) => ({ ...m, order: i }));

  recomputeStatuses(profile);
  profile.updatedAt = new Date().toISOString();
  await saveProfile(userId, profile);

  return NextResponse.json({ ok: true });
}
