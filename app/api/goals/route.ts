import { NextRequest, NextResponse } from "next/server";
import { loadProfile, saveProfile, markOnboardedIfNeeded } from "@/lib/db";
import { requireUserId, unauthorized } from "@/lib/auth";
import { recordActivity } from "@/lib/stats";
import { todayKey } from "@/lib/date";
import { genId } from "@/lib/goals";
import { Goal, Profile } from "@/lib/types";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const profile = await loadProfile(userId);
  return NextResponse.json(profile);
}

// Onboarding: accepts 1-5 free-text goal strings and stores them permanently.
// Calling this again replaces the full goal list (used by the onboarding
// page, which always submits its current full set).
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const body = await req.json();
  const rawGoals: unknown[] = Array.isArray(body.goals) ? body.goals : [];

  const existing = await loadProfile(userId);
  const existingByText = new Map(existing.goals.map((g) => [g.text, g]));

  const goals: Goal[] = rawGoals
    .filter((g): g is string => typeof g === "string" && g.trim().length > 0)
    .slice(0, 5)
    .map((text) => {
      const trimmed = text.trim();
      // Preserve an existing goal's progress if the text matches exactly;
      // otherwise this is a brand new goal.
      const prior = existingByText.get(trimmed);
      if (prior) return prior;
      return {
        id: genId("goal"),
        text: trimmed,
        createdAt: new Date().toISOString(),
        status: "inactive",
        milestones: [],
      } as Goal;
    });

  const profile: Profile = {
    goals,
    updatedAt: new Date().toISOString(),
  };

  await saveProfile(userId, profile);
  await markOnboardedIfNeeded(userId);
  await recordActivity(userId, todayKey());

  return NextResponse.json(profile);
}
