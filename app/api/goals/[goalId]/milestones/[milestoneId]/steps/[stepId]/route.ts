import { NextRequest, NextResponse } from "next/server";
import { loadProfile, saveProfile } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { findGoal, findMilestone } from "@/lib/goals";

// Update a single step's freeform notes (the user's own research/findings
// jotted while working that step -- e.g. a useful link found mid-task).
// Deliberately separate from the steps PUT (confirm/edit) endpoint above,
// since notes are saved independently and shouldn't require re-validating
// or re-cleaning the whole step list. Guests never hit this route -- the
// client mutates its localStorage Profile directly (lib/guestStore.ts).
export async function PATCH(
  req: NextRequest,
  {
    params,
  }: { params: { goalId: string; milestoneId: string; stepId: string } }
) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in with Google or LinkedIn to use this." },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const notes = typeof body.notes === "string" ? body.notes : "";

  const profile = await loadProfile(userId);
  const goal = findGoal(profile, params.goalId);
  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  const milestone = findMilestone(goal, params.milestoneId);
  if (!milestone)
    return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
  const step = milestone.steps.find((s) => s.id === params.stepId);
  if (!step) return NextResponse.json({ error: "Step not found" }, { status: 404 });

  step.notes = notes;
  profile.updatedAt = new Date().toISOString();
  await saveProfile(userId, profile);

  return NextResponse.json({ step });
}
