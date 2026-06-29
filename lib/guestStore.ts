"use client";

// Client-only localStorage store for guest mode. A signed-out user can use
// the entire app -- Onboarding, Goal Activation, the Daily Loop, Weekly
// Review, and the Dashboard -- with everything persisted here instead of
// Supabase. On sign-in, ensureGuestMigrated() ships all of this to
// /api/migrate-guest exactly once and then clears it; from that point on
// every page reads/writes Supabase only (see lib/db.ts via the API routes).

import {
  DailyLog,
  EMPTY_META,
  EMPTY_PROFILE,
  EMPTY_STATS,
  Profile,
  UserMeta,
  UserStats,
  WeeklyReview,
} from "./types";

const PROFILE_KEY = "cos:guest:profile";
const META_KEY = "cos:guest:meta";
const STATS_KEY = "cos:guest:stats";
const DAILY_PREFIX = "cos:guest:daily:";
const DAILY_INDEX_KEY = "cos:guest:daily:index";
const WEEKLY_PREFIX = "cos:guest:weekly:";
const WEEKLY_INDEX_KEY = "cos:guest:weekly:index";
// Legacy key from the earlier, goal-text-only trial (lib/localDraft.ts).
// Cleared too so nothing lingers after migration or a reset.
const LEGACY_DRAFT_KEY = "cos:draft:goals";

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function loadGuestProfile(): Profile {
  return readJSON<Profile>(PROFILE_KEY, { ...EMPTY_PROFILE });
}
export function saveGuestProfile(profile: Profile): void {
  writeJSON(PROFILE_KEY, profile);
}

export function loadGuestMeta(): UserMeta {
  return readJSON<UserMeta>(META_KEY, { ...EMPTY_META });
}
export function saveGuestMeta(meta: UserMeta): void {
  writeJSON(META_KEY, meta);
}

export function loadGuestStats(): UserStats {
  return readJSON<UserStats>(STATS_KEY, { ...EMPTY_STATS });
}
export function saveGuestStats(stats: UserStats): void {
  writeJSON(STATS_KEY, stats);
}

function dailyIndex(): string[] {
  return readJSON<string[]>(DAILY_INDEX_KEY, []);
}
function addToDailyIndex(date: string): void {
  const idx = dailyIndex();
  if (!idx.includes(date)) writeJSON(DAILY_INDEX_KEY, [...idx, date]);
}

export function loadGuestDailyLog(date: string): DailyLog | null {
  return readJSON<DailyLog | null>(DAILY_PREFIX + date, null);
}
export function saveGuestDailyLog(log: DailyLog): void {
  writeJSON(DAILY_PREFIX + log.date, log);
  addToDailyIndex(log.date);
}
export function loadAllGuestDailyLogs(): DailyLog[] {
  return dailyIndex()
    .map((d) => loadGuestDailyLog(d))
    .filter((l): l is DailyLog => l !== null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

function weeklyIndex(): string[] {
  return readJSON<string[]>(WEEKLY_INDEX_KEY, []);
}
function addToWeeklyIndex(weekEnd: string): void {
  const idx = weeklyIndex();
  if (!idx.includes(weekEnd)) writeJSON(WEEKLY_INDEX_KEY, [...idx, weekEnd]);
}
export function loadGuestWeeklyReview(weekEnd: string): WeeklyReview | null {
  return readJSON<WeeklyReview | null>(WEEKLY_PREFIX + weekEnd, null);
}
export function saveGuestWeeklyReview(review: WeeklyReview): void {
  writeJSON(WEEKLY_PREFIX + review.weekEnd, review);
  addToWeeklyIndex(review.weekEnd);
}
export function loadAllGuestWeeklyReviews(): WeeklyReview[] {
  return weeklyIndex()
    .map((w) => loadGuestWeeklyReview(w))
    .filter((r): r is WeeklyReview => r !== null);
}

// True once the guest has done anything worth migrating: typed a real goal,
// or run at least one day of the Daily Loop.
export function hasGuestActivity(): boolean {
  const profile = loadGuestProfile();
  if (profile.goals.some((g) => g.text.trim().length > 0)) return true;
  if (dailyIndex().length > 0) return true;
  return false;
}

export function collectGuestDataForMigration(): {
  profile: Profile;
  dailyLogs: DailyLog[];
  weeklyReviews: WeeklyReview[];
} {
  return {
    profile: loadGuestProfile(),
    dailyLogs: loadAllGuestDailyLogs(),
    weeklyReviews: loadAllGuestWeeklyReviews(),
  };
}

export function clearAllGuestData(): void {
  if (typeof window === "undefined") return;
  const keys = [
    PROFILE_KEY,
    META_KEY,
    STATS_KEY,
    DAILY_INDEX_KEY,
    WEEKLY_INDEX_KEY,
    LEGACY_DRAFT_KEY,
  ];
  for (const d of dailyIndex()) keys.push(DAILY_PREFIX + d);
  for (const w of weeklyIndex()) keys.push(WEEKLY_PREFIX + w);
  for (const k of keys) window.localStorage.removeItem(k);
}

// Module-level cache so every page that calls this on mount (Goals, Daily,
// Weekly, Dashboard) dedupes into a single migration request instead of
// firing one each, and so a page navigated to right after sign-in doesn't
// race the migration that another page already kicked off.
let migrationPromise: Promise<void> | null = null;

export function ensureGuestMigrated(): Promise<void> {
  if (migrationPromise) return migrationPromise;

  if (!hasGuestActivity()) {
    migrationPromise = Promise.resolve();
    return migrationPromise;
  }

  const payload = collectGuestDataForMigration();
  migrationPromise = fetch("/api/migrate-guest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((res) => {
      if (res.ok) {
        clearAllGuestData();
      } else {
        // Leave local data in place and let the next call retry rather
        // than silently losing it.
        migrationPromise = null;
      }
    })
    .catch(() => {
      migrationPromise = null;
    });

  return migrationPromise;
}
