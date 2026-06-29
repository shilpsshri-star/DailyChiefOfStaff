"use client";

import { useEffect, useRef, useState } from "react";
import { useUser, SignInButton } from "@clerk/nextjs";
import { Badge, DailyLog, UserStats } from "@/lib/types";
import { todayKey } from "@/lib/date";
import {
  computeEarnedBadges,
  monthlyCompletedCount,
  weeklyCompletedCount,
} from "@/lib/statsCore";
import {
  ensureGuestMigrated,
  loadGuestDailyLog,
  loadGuestStats,
} from "@/lib/guestStore";

export default function DashboardPage() {
  const { isLoaded } = useUser();

  if (!isLoaded) return <p className="text-ink/60">Loading…</p>;

  return <DashboardContent />;
}

interface StatsResponse {
  stats: UserStats;
  badges: Badge[];
  todayCompleted: number;
  weekCompleted: number;
  monthCompleted: number;
}

function dateMinusDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() - days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function DashboardContent() {
  const { isSignedIn } = useUser();
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<DailyLog | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const wasSignedIn = useRef(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      if (isSignedIn) {
        if (!wasSignedIn.current) await ensureGuestMigrated();
        const res = await fetch("/api/stats");
        setData(await res.json());
      } else {
        const today = todayKey();
        const stats = loadGuestStats();
        setData({
          stats,
          badges: computeEarnedBadges(stats),
          todayCompleted: stats.completedByDate[today] ?? 0,
          weekCompleted: weeklyCompletedCount(stats, today),
          monthCompleted: monthlyCompletedCount(stats, today),
        });
      }
      wasSignedIn.current = Boolean(isSignedIn);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  async function viewDay(date: string) {
    setSelectedDate(date);
    setDayLoading(true);
    setDayDetail(null);
    try {
      if (isSignedIn) {
        const res = await fetch(`/api/day/${date}`);
        const json = await res.json();
        setDayDetail(json.log ?? null);
      } else {
        setDayDetail(loadGuestDailyLog(date));
      }
    } finally {
      setDayLoading(false);
    }
  }

  if (loading) return <p className="text-ink/60">Loading…</p>;
  if (!data) return <p className="text-ink/60">Couldn't load your stats.</p>;

  const { stats, badges, todayCompleted, weekCompleted, monthCompleted } = data;
  const today = todayKey();

  // Last 30 days for the Memory Lane strip, most recent first.
  const last30 = Array.from({ length: 30 }, (_, i) => dateMinusDays(today, i));
  const activeSet = new Set(stats.activeDates);

  const allBadgeIds = new Set(badges.map((b) => b.id));
  const lockedBadges = [
    { id: "first_day", label: "First Day", description: "Showed up for the first time.", emoji: "🌱" },
    { id: "seven_day_streak", label: "7-Day Streak", description: "Showed up 7 days in a row.", emoji: "🔥" },
    { id: "ten_steps_done", label: "10 Steps Done", description: "Completed 10 steps total.", emoji: "✅" },
    { id: "first_milestone", label: "First Milestone", description: "Completed your first milestone.", emoji: "🚩" },
    { id: "first_goal_completed", label: "Goal Getter", description: "Completed your first goal.", emoji: "🏆" },
    { id: "thirty_day_streak", label: "30-Day Streak", description: "Showed up 30 days in a row.", emoji: "💎" },
  ].filter((b) => !allBadgeIds.has(b.id));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Progress Dashboard</h1>
        <p className="mt-1 text-ink/70">
          Your streaks, stats, badges, and a timeline of every day you've shown up.
        </p>
      </div>

      {!isSignedIn && (
        <div className="flex flex-col items-start gap-3 rounded-md border border-accent/30 bg-accent/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink">
            Login to save your progress and access it every day.
          </p>
          <SignInButton mode="modal" fallbackRedirectUrl="/dashboard">
            <button className="btn-primary shrink-0 px-4 py-2 text-sm">
              Continue with Google or LinkedIn
            </button>
          </SignInButton>
        </div>
      )}

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-semibold">{stats.currentStreak}</p>
          <p className="mt-1 text-xs text-ink/60">Current streak (days)</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-semibold">{stats.longestStreak}</p>
          <p className="mt-1 text-xs text-ink/60">Longest streak (days)</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-semibold">{todayCompleted}</p>
          <p className="mt-1 text-xs text-ink/60">Steps done today</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-semibold">{stats.totalStepsCompleted}</p>
          <p className="mt-1 text-xs text-ink/60">Steps done all-time</p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card p-4 text-center">
          <p className="text-xl font-semibold">{weekCompleted}</p>
          <p className="mt-1 text-xs text-ink/60">Steps done — last 7 days</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xl font-semibold">{monthCompleted}</p>
          <p className="mt-1 text-xs text-ink/60">Steps done — last 30 days</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xl font-semibold">{stats.totalMilestonesCompleted}</p>
          <p className="mt-1 text-xs text-ink/60">Milestones completed</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xl font-semibold">{stats.totalGoalsCompleted}</p>
          <p className="mt-1 text-xs text-ink/60">Goals completed</p>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-medium">Achievement badges</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {badges.map((b) => (
            <div
              key={b.id}
              className="rounded-md border border-[#e8e6e1] bg-[#fbfaf7] p-3 text-center"
            >
              <p className="text-2xl">{b.emoji}</p>
              <p className="mt-1 text-sm font-medium">{b.label}</p>
              <p className="mt-0.5 text-xs text-ink/60">{b.description}</p>
            </div>
          ))}
          {lockedBadges.map((b) => (
            <div
              key={b.id}
              className="rounded-md border border-dashed border-[#e8e6e1] p-3 text-center opacity-40"
            >
              <p className="text-2xl">{b.emoji}</p>
              <p className="mt-1 text-sm font-medium">{b.label}</p>
              <p className="mt-0.5 text-xs text-ink/60">{b.description}</p>
            </div>
          ))}
          {badges.length === 0 && lockedBadges.length === 0 && (
            <p className="text-sm text-ink/50">No badges defined.</p>
          )}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-medium">Memory Lane</h2>
        <p className="mt-1 text-sm text-ink/60">
          Click any day in the last 30 to see what you worked on and accomplished.
        </p>
        <div className="mt-4 grid grid-cols-7 gap-1.5 sm:grid-cols-10">
          {last30.map((d) => {
            const active = activeSet.has(d);
            const isToday = d === today;
            return (
              <button
                key={d}
                type="button"
                onClick={() => viewDay(d)}
                title={d}
                className={
                  "aspect-square rounded-sm text-[10px] transition " +
                  (active
                    ? "bg-accent text-white hover:opacity-80"
                    : "bg-[#f1efe9] text-ink/40 hover:bg-[#e8e6e1]") +
                  (isToday ? " ring-2 ring-accent ring-offset-1" : "") +
                  (selectedDate === d ? " ring-2 ring-ink" : "")
                }
              >
                {Number(d.slice(8, 10))}
              </button>
            );
          })}
        </div>

        {selectedDate && (
          <div className="mt-5 rounded-md border border-[#e8e6e1] p-4">
            <p className="text-xs uppercase tracking-wide text-ink/40">
              {selectedDate}
            </p>
            {dayLoading ? (
              <p className="mt-2 text-sm text-ink/60">Loading…</p>
            ) : !dayDetail || dayDetail.focusItems.length === 0 ? (
              <p className="mt-2 text-sm text-ink/50">
                Nothing recorded for this day.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-sm font-medium">Focus items</p>
                <ul className="space-y-2">
                  {dayDetail.focusItems.map((item) => {
                    const result = dayDetail.results.find(
                      (r) => r.stepId === item.stepId
                    );
                    return (
                      <li
                        key={item.stepId}
                        className="rounded-md border border-[#e8e6e1] p-3"
                      >
                        <p className="text-xs uppercase tracking-wide text-ink/40">
                          {item.goalText} · {item.milestoneText}
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <span className="text-sm">{item.stepText}</span>
                          {result && (
                            <span className="shrink-0 rounded-full bg-[#f1efe9] px-2 py-0.5 text-xs capitalize text-ink/70">
                              {result.status}
                            </span>
                          )}
                        </div>
                        {result?.note && (
                          <p className="mt-1 text-sm text-ink/60">{result.note}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {dayDetail.adjustmentNote && (
                  <div>
                    <p className="text-sm font-medium">Chief of staff's note</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink/70">
                      {dayDetail.adjustmentNote}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
