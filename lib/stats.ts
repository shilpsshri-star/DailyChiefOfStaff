import { getSupabaseAdmin } from "./supabase";
import { ensureUser } from "./db";
import { EMPTY_STATS, UserStats } from "./types";
import { applyActivity } from "./statsCore";

export {
  BADGES,
  computeEarnedBadges,
  weeklyCompletedCount,
  monthlyCompletedCount,
} from "./statsCore";

// Stats are stored as a single denormalized JSON blob in the `stats` column
// of the user's row in Supabase -- always read/written as a unit (never
// queried by sub-field), so a JSON column is a better fit here than a table.
export async function getStats(userId: string): Promise<UserStats> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .select("stats")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[db:getStats]", error);
    throw error;
  }
  const stats = (data?.stats as Partial<UserStats>) ?? {};
  return { ...EMPTY_STATS, ...stats };
}

// Call this whenever the user does something meaningful (saves a profile,
// generates a morning focus, completes an evening check-in, activates a
// milestone/goal) so streaks stay accurate. The actual math lives in the
// pure applyActivity() helper (lib/statsCore.ts) so guest-mode client code
// can run the identical computation against locally-held stats.
export async function recordActivity(
  userId: string,
  date: string,
  opts: {
    stepsCompletedToday?: number;
    totalGoalsCompleted?: number;
    totalMilestonesCompleted?: number;
  } = {}
): Promise<UserStats> {
  await ensureUser(userId);
  const stats = await getStats(userId);
  const updated = applyActivity(stats, date, opts);

  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("users")
    .update({ stats: updated })
    .eq("id", userId);
  if (error) {
    console.error("[db:recordActivity]", error);
    throw error;
  }

  return updated;
}
