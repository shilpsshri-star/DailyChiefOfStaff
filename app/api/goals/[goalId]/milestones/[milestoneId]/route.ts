import { NextRequest, NextResponse } from "next/server";
import { loadProfile, saveProfile } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { findGoal, findMilestone } from "@/lib/goals";

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
