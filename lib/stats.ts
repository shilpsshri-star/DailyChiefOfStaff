import { kvGet, kvSet, KEYS } from "./kv";
import { dateMinusDays } from "./date";
import { Badge, EMPTY_STATS, UserStats } from "./types";

// Recomputes current/longest streak from the set of active dates.
// "Streak" = consecutive calendar days, ending today or yesterday (so a
// streak doesn't visibly break until a full day has passed with no activity).
function computeStreaks(
  activeDates: string[],
  today: string
): { current: number; longest: number } {
  const set = new Set(activeDates);

  let longest = 0;
  let run = 0;
  const sorted = [...activeDates].sort();
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || dateMinusDays(sorted[i], 1) === sorted[i - 1]) {
      run += 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
  }

  let current = 0;
  let cursor = set.has(today) ? today : dateMinusDays(today, 1);
  while (set.has(cursor)) {
    current += 1;
    cursor = dateMinusDays(cursor, 1);
  }

  return { current, longest };
}

export async function getStats(userId: string): Promise<UserStats> {
  return (await kvGet<UserStats>(KEYS.stats(userId))) ?? { ...EMPTY_STATS };
}

// Call this whenever the user does something meaningful (saves a profile,
// generates a morning focus, completes an evening check-in, activates a
// milestone/goal) so streaks stay accurate.
export async function recordActivity(
  userId: string,
  date: string,
  opts: {
    stepsCompletedToday?: number;
    totalGoalsCompleted?: number;
    totalMilestonesCompleted?: number;
  } = {}
): Promise<UserStats> {
  const stats = await getStats(userId);

  const activeDates = Array.from(new Set([...stats.activeDates, date])).sort();

  const completedByDate = { ...stats.completedByDate };
  if (typeof opts.stepsCompletedToday === "number") {
    completedByDate[date] = opts.stepsCompletedToday;
  }

  const totalStepsCompleted = Object.values(completedByDate).reduce(
    (sum, n) => sum + n,
    0
  );

  const totalGoalsCompleted =
    typeof opts.totalGoalsCompleted === "number"
      ? opts.totalGoalsCompleted
      : stats.totalGoalsCompleted;

  const totalMilestonesCompleted =
    typeof opts.totalMilestonesCompleted === "number"
      ? opts.totalMilestonesCompleted
      : stats.totalMilestonesCompleted;

  const { current, longest } = computeStreaks(activeDates, date);

  const updated: UserStats = {
    activeDates,
    completedByDate,
    totalStepsCompleted,
    totalGoalsCompleted,
    totalMilestonesCompleted,
    currentStreak: current,
    longestStreak: Math.max(longest, stats.longestStreak),
    lastActiveDate: date,
  };

  await kvSet(KEYS.stats(userId), updated);
  return updated;
}

export const BADGES: {
  id: string;
  label: string;
  description: string;
  emoji: string;
  earned: (s: UserStats) => boolean;
}[] = [
  {
    id: "first_day",
    label: "First Day",
    description: "Showed up for the first time.",
    emoji: "🌱",
    earned: (s) => s.activeDates.length >= 1,
  },
  {
    id: "seven_day_streak",
    label: "7-Day Streak",
    description: "Showed up 7 days in a row.",
    emoji: "🔥",
    earned: (s) => s.longestStreak >= 7,
  },
  {
    id: "ten_steps_done",
    label: "10 Steps Done",
    description: "Completed 10 steps total.",
    emoji: "✅",
    earned: (s) => s.totalStepsCompleted >= 10,
  },
  {
    id: "first_milestone",
    label: "Milestone Reached",
    description: "Completed your first milestone.",
    emoji: "🚩",
    earned: (s) => s.totalMilestonesCompleted >= 1,
  },
  {
    id: "first_goal_completed",
    label: "Goal Getter",
    description: "Completed your first goal.",
    emoji: "🏆",
    earned: (s) => s.totalGoalsCompleted >= 1,
  },
  {
    id: "thirty_day_streak",
    label: "30-Day Streak",
    description: "Showed up 30 days in a row.",
    emoji: "💎",
    earned: (s) => s.longestStreak >= 30,
  },
];

export function computeEarnedBadges(stats: UserStats): Badge[] {
  return BADGES.filter((b) => b.earned(stats)).map((b) => ({
    id: b.id,
    label: b.label,
    description: b.description,
    emoji: b.emoji,
  }));
}

export function weeklyCompletedCount(stats: UserStats, today: string): number {
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = dateMinusDays(today, i);
    total += stats.completedByDate[d] ?? 0;
  }
  return total;
}

export function monthlyCompletedCount(stats: UserStats, today: string): number {
  let total = 0;
  for (let i = 0; i < 30; i++) {
    const d = dateMinusDays(today, i);
    total += stats.completedByDate[d] ?? 0;
  }
  return total;
}
