"use client";

import { useEffect, useRef, useState } from "react";
import { useUser, SignInButton } from "@clerk/nextjs";
import { WeeklyReview } from "@/lib/types";
import { todayKey, dateMinusDays, daysBetween } from "@/lib/date";
import { buildWeekRecap } from "@/lib/goals";
import {
  ensureGuestMigrated,
  loadAllGuestDailyLogs,
  loadGuestMeta,
  loadGuestProfile,
  loadGuestWeeklyReview,
  saveGuestMeta,
  saveGuestWeeklyReview,
} from "@/lib/guestStore";

export default function WeeklyPage() {
  const { isLoaded } = useUser();

  if (!isLoaded) return <p className="text-ink/60">Loading…</p>;

  return <WeeklyContent />;
}

function WeeklyContent() {
  const { isSignedIn } = useUser();
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [due, setDue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wasSignedIn = useRef(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (isSignedIn) {
          if (!wasSignedIn.current) await ensureGuestMigrated();
          const res = await fetch("/api/weekly");
          const data = await res.json();
          if (data.error) {
            setError(data.error);
            return;
          }
          setReview(data.review ?? null);
          setDue(Boolean(data.due));
        } else {
          const today = todayKey();
          const meta = loadGuestMeta();
          const isDue =
            !meta.lastWeeklyReviewDate ||
            daysBetween(meta.lastWeeklyReviewDate, today) >= 7;

          if (!isDue) {
            const latest = meta.lastWeeklyReviewDate
              ? loadGuestWeeklyReview(meta.lastWeeklyReviewDate)
              : null;
            setReview(latest);
            setDue(false);
            return;
          }

          const profile = loadGuestProfile();
          const allLogs = loadAllGuestDailyLogs();
          const last7Dates = new Set(
            Array.from({ length: 7 }, (_, i) => dateMinusDays(today, i))
          );
          const logs = allLogs.filter((l) => last7Dates.has(l.date));

          if (logs.length === 0 && profile.goals.length === 0) {
            setReview(null);
            setDue(false);
            return;
          }

          const recap = buildWeekRecap(profile, logs);
          const res = await fetch("/api/weekly", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recap }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error ?? "Couldn't generate your weekly review.");
            return;
          }

          const weekStart = meta.lastWeeklyReviewDate ?? dateMinusDays(today, 7);
          const newReview: WeeklyReview = {
            weekStart,
            weekEnd: today,
            moved: data.result.moved,
            stuck: data.result.stuck,
            replan: data.result.replan,
            celebration: data.result.celebration,
            generatedAt: new Date().toISOString(),
          };
          saveGuestWeeklyReview(newReview);
          saveGuestMeta({ ...meta, lastWeeklyReviewDate: today });
          setReview(newReview);
          setDue(true);
        }
      } finally {
        wasSignedIn.current = Boolean(isSignedIn);
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  if (loading) return <p className="text-ink/60">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Weekly Review</h1>
        <p className="mt-1 text-ink/70">
          Auto-generated every 7 days from your daily check-ins.
        </p>
      </div>

      {!isSignedIn && (
        <div className="flex flex-col items-start gap-3 rounded-md border border-accent/30 bg-accent/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink">
            Login to save your progress and access it every day.
          </p>
          <SignInButton mode="modal" fallbackRedirectUrl="/weekly">
            <button className="btn-primary shrink-0 px-4 py-2 text-sm">
              Continue with Google or LinkedIn
            </button>
          </SignInButton>
        </div>
      )}

      {error && (
        <div className="card border-red-200 p-4 text-sm text-red-600">{error}</div>
      )}

      {!review && (
        <div className="card p-6 text-center text-ink/60">
          {due
            ? "Not enough activity yet this week to generate a review. Run a few days of the Daily Loop first."
            : "Your first weekly review will appear once you've completed 7 days since onboarding."}
        </div>
      )}

      {review && (
        <>
          <div className="text-sm text-ink/50">
            {review.weekStart} → {review.weekEnd}
            {due && (
              <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
                new this week
              </span>
            )}
          </div>

          <section className="card p-5">
            <h2 className="font-medium">🎉 Celebrate this week's wins</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">{review.celebration}</p>
          </section>

          <section className="card p-5">
            <h2 className="font-medium">What moved</h2>
            {review.moved.length === 0 ? (
              <p className="mt-2 text-sm text-ink/50">Nothing logged as moved.</p>
            ) : (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {review.moved.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="font-medium">What's stuck</h2>
            {review.stuck.length === 0 ? (
              <p className="mt-2 text-sm text-ink/50">Nothing stuck — nice.</p>
            ) : (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {review.stuck.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="font-medium">Next sprint replan</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">{review.replan}</p>
          </section>
        </>
      )}
    </div>
  );
}
