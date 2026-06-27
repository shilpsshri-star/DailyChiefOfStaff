import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet, KEYS } from "@/lib/kv";
import { requireUserId, unauthorized } from "@/lib/auth";
import { recordActivity } from "@/lib/stats";
import { todayKey } from "@/lib/date";
import { genId } from "@/lib/goals";
import { EMPTY_META, EMPTY_PROFILE, Goal, Profile, UserMeta } from "@/lib/types";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const profile = await kvGet<Profile>(KEYS.profile(userId));
  return NextResponse.json(profile ?? EMPTY_PROFILE);
}

// Onboarding: accepts 1-5 free-text goal strings and stores them permanently.
// Calling this again replaces the full goal list (used by the onboarding
// page, which always submits its current full set).
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const body = await req.json();
  const rawGoals: unknown[] = Array.isArray(body.goals) ? body.goals : [];

  const existing =
    (await kvGet<Profile>(KEYS.profile(userId))) ?? EMPTY_PROFILE;
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

  await kvSet(KEYS.profile(userId), profile);

  const meta = (await kvGet<UserMeta>(KEYS.meta(userId))) ?? { ...EMPTY_META };
  if (!meta.onboardedAt) {
    meta.onboardedAt = new Date().toISOString();
    await kvSet(KEYS.meta(userId), meta);
  }

  await recordActivity(userId, todayKey());

  return NextResponse.json(profile);
}
