import { NextRequest, NextResponse } from "next/server";
import {
  loadProfile,
  loadDailyLog,
  loadWeeklyReview,
  saveWeeklyReview,
  getUserMeta,
  setLastWeeklyReviewDate,
} from "@/lib/db";
import { requireUserId, unauthorized } from "@/lib/auth";
import { weeklyReplan } from "@/lib/planner";
import { buildWeekRecap } from "@/lib/goals";
import { dateMinusDays, daysBetween, todayKey } from "@/lib/date";
import { DailyLog, WeeklyReview } from "@/lib/types";

// Signed-in only -- the "due" check and persistence both depend on Supabase
// state. Guests never call this; they compute "due" client-side from their
// localStorage meta (same daysBetween() math) and, when due, POST below for
// the stateless AI call instead.
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const today = todayKey();
  const meta = await getUserMeta(userId);

  const due =
    !meta.lastWeeklyReviewDate ||
    daysBetween(meta.lastWeeklyReviewDate, today) >= 7;

  if (!due) {
    const latest = meta.lastWeeklyReviewDate
      ? await loadWeeklyReview(userId, meta.lastWeeklyReviewDate)
      : null;
    return NextResponse.json({ due: false, review: latest });
  }

  const profile = await loadProfile(userId);
  const logs: DailyLog[] = [];
  for (let i = 0; i < 7; i++) {
    const d = dateMinusDays(today, i);
    const log = await loadDailyLog(userId, d);
    if (log) logs.push(log);
  }
  logs.sort((a, b) => (a.date < b.date ? -1 : 1));

  if (logs.length === 0 && profile.goals.length === 0) {
    return NextResponse.json({ due: false, review: null });
  }

  const recap = buildWeekRecap(profile, logs);

  let result;
  try {
    result = await weeklyReplan(recap);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const weekStart = meta.lastWeeklyReviewDate ?? dateMinusDays(today, 7);
  const review: WeeklyReview = {
    weekStart,
    weekEnd: today,
    moved: result.moved,
    stuck: result.stuck,
    replan: result.replan,
    celebration: result.celebration,
    generatedAt: new Date().toISOString(),
  };

  await saveWeeklyReview(userId, review);
  await setLastWeeklyReviewDate(userId, today);

  return NextResponse.json({ due: true, review });
}

// Stateless AI call for guest mode: the client builds the recap text itself
// (buildWeekRecap() from lib/goals.ts, against its localStorage Profile +
// DailyLogs) and sends just that string. No persistence here regardless of
// auth state -- the client saves the resulting WeeklyReview into its own
// localStorage (lib/guestStore.ts).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const recap = typeof body.recap === "string" ? body.recap : "";
  if (!recap.trim()) {
    return NextResponse.json({ error: "Missing recap." }, { status: 400 });
  }

  try {
    const result = await weeklyReplan(recap);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
