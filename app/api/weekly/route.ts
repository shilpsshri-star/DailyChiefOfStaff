import { NextResponse } from "next/server";
import { kvGet, kvSet, KEYS } from "@/lib/kv";
import { requireUserId, unauthorized } from "@/lib/auth";
import { weeklyReplan } from "@/lib/planner";
import { dateMinusDays, daysBetween, todayKey } from "@/lib/date";
import {
  DailyLog,
  EMPTY_META,
  EMPTY_PROFILE,
  Profile,
  UserMeta,
  WeeklyReview,
} from "@/lib/types";

function buildWeekRecap(profile: Profile, logs: DailyLog[]): string {
  const goalLines = profile.goals.map((g) => {
    const ms = g.milestones
      .map(
        (m) =>
          `  - Milestone: ${m.text} [${m.status}] (${
            m.steps.filter((s) => s.status === "done").length
          }/${m.steps.length} steps done)`
      )
      .join("\n");
    return `Goal: ${g.text} [${g.status}]\n${ms || "  (no milestones yet)"}`;
  });

  const dayLines = logs.flatMap((log) =>
    log.results.map((r) => {
      const item = log.focusItems.find((f) => f.stepId === r.stepId);
      return `${log.date}: ${item ? item.stepText : r.stepId} -> ${r.status}${
        r.note ? ` (${r.note})` : ""
      }`;
    })
  );

  return [
    "GOALS AND PROGRESS:",
    goalLines.join("\n\n") || "(no goals yet)",
    "",
    "LAST 7 DAYS OF ACTIVITY:",
    dayLines.join("\n") || "(no daily activity logged this week)",
  ].join("\n");
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const today = todayKey();
  const meta = (await kvGet<UserMeta>(KEYS.meta(userId))) ?? { ...EMPTY_META };

  const due =
    !meta.lastWeeklyReviewDate ||
    daysBetween(meta.lastWeeklyReviewDate, today) >= 7;

  if (!due) {
    const latest = meta.lastWeeklyReviewDate
      ? await kvGet<WeeklyReview>(KEYS.weeklyReview(userId, meta.lastWeeklyReviewDate))
      : null;
    return NextResponse.json({ due: false, review: latest });
  }

  const profile = (await kvGet<Profile>(KEYS.profile(userId))) ?? EMPTY_PROFILE;
  const logs: DailyLog[] = [];
  for (let i = 0; i < 7; i++) {
    const d = dateMinusDays(today, i);
    const log = await kvGet<DailyLog>(KEYS.dailyLog(userId, d));
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

  await kvSet(KEYS.weeklyReview(userId, today), review);
  await kvSet(KEYS.meta(userId), { ...meta, lastWeeklyReviewDate: today });

  return NextResponse.json({ due: true, review });
}
