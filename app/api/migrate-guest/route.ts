import { NextRequest, NextResponse } from "next/server";
import { requireUserId, unauthorized } from "@/lib/auth";
import {
  getUserMeta,
  loadProfile,
  markOnboardedIfNeeded,
  saveDailyLog,
  saveProfile,
  saveWeeklyReview,
  setLastWeeklyReviewDate,
} from "@/lib/db";
import { recordActivity } from "@/lib/stats";
import { countCompletedGoals, countCompletedMilestones } from "@/lib/goals";
import { DailyLog, Profile, WeeklyReview } from "@/lib/types";

// One-shot migration: ships everything a guest accumulated in localStorage
// (lib/guestStore.ts) into this Clerk user's Supabase-backed data on
// sign-in. Called automatically by ensureGuestMigrated() the first time any
// page notices isSignedIn flip true with guest data still present.
//
// Idempotent/safe to retry: goals are merged by exact text match (the same
// rule /api/goals POST already uses) so re-running this after a partial
// failure never duplicates a goal, and daily logs / weekly reviews are
// wholesale-replaced by date, so re-sending the same day twice is a no-op.
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const guestProfile = body.profile as Profile | undefined;
  const guestDailyLogs: DailyLog[] = Array.isArray(body.dailyLogs) ? body.dailyLogs : [];
  const guestWeeklyReviews: WeeklyReview[] = Array.isArray(body.weeklyReviews)
    ? body.weeklyReviews
    : [];

  let mergedProfile: Profile | null = null;

  if (guestProfile && Array.isArray(guestProfile.goals) && guestProfile.goals.length > 0) {
    const existing = await loadProfile(userId);
    const existingByText = new Map(existing.goals.map((g) => [g.text, g]));
    const mergedGoals = [...existing.goals];
    for (const guestGoal of guestProfile.goals) {
      if (!guestGoal.text || !guestGoal.text.trim()) continue;
      if (!existingByText.has(guestGoal.text)) {
        mergedGoals.push(guestGoal);
      }
      // A goal with the same text already exists server-side -- keep the
      // server's version (it's now the source of truth) rather than
      // overwriting any progress made there since the guest trial.
    }
    mergedProfile = { goals: mergedGoals.slice(0, 50), updatedAt: new Date().toISOString() };
    try {
      await saveProfile(userId, mergedProfile);
      await markOnboardedIfNeeded(userId);
    } catch (err) {
      console.error("[migrate-guest] saveProfile failed", err);
      return NextResponse.json({ error: "Couldn't migrate your goals." }, { status: 500 });
    }
  }

  const sortedLogs = [...guestDailyLogs].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (let i = 0; i < sortedLogs.length; i++) {
    const log = sortedLogs[i];
    if (!log || !log.date) continue;
    try {
      await saveDailyLog(userId, log);
      const completed = log.results.filter((r) => r.status === "done").length;
      const isLast = i === sortedLogs.length - 1;
      await recordActivity(userId, log.date, {
        stepsCompletedToday: completed,
        ...(isLast && mergedProfile
          ? {
              totalGoalsCompleted: countCompletedGoals(mergedProfile),
              totalMilestonesCompleted: countCompletedMilestones(mergedProfile),
            }
          : {}),
      });
    } catch (err) {
      console.error("[migrate-guest] saveDailyLog failed", log.date, err);
    }
  }

  for (const review of guestWeeklyReviews) {
    if (!review || !review.weekEnd) continue;
    try {
      await saveWeeklyReview(userId, review);
    } catch (err) {
      console.error("[migrate-guest] saveWeeklyReview failed", review.weekEnd, err);
    }
  }

  if (guestWeeklyReviews.length > 0) {
    const meta = await getUserMeta(userId);
    const weekEnds = guestWeeklyReviews.map((r) => r.weekEnd).filter(Boolean).sort();
    const latestWeekEnd = weekEnds[weekEnds.length - 1];
    if (
      latestWeekEnd &&
      (!meta.lastWeeklyReviewDate || latestWeekEnd > meta.lastWeeklyReviewDate)
    ) {
      try {
        await setLastWeeklyReviewDate(userId, latestWeekEnd);
      } catch (err) {
        console.error("[migrate-guest] setLastWeeklyReviewDate failed", err);
      }
    }
  }

  const finalProfile = await loadProfile(userId);
  return NextResponse.json({ profile: finalProfile });
}
