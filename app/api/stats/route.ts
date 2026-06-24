import { NextResponse } from "next/server";
import { requireUserId, unauthorized } from "@/lib/auth";
import { getStats, computeEarnedBadges, weeklyCompletedCount, monthlyCompletedCount } from "@/lib/stats";
import { todayKey } from "@/lib/date";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const stats = await getStats(userId);
  const today = todayKey();

  return NextResponse.json({
    stats,
    badges: computeEarnedBadges(stats),
    todayCompleted: stats.completedByDate[today] ?? 0,
    weekCompleted: weeklyCompletedCount(stats, today),
    monthCompleted: monthlyCompletedCount(stats, today),
  });
}
