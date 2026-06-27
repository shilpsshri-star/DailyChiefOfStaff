"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { WeeklyReview } from "@/lib/types";
import AuthGate from "@/components/AuthGate";

export default function WeeklyPage() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) return <p className="text-ink/60">Loading…</p>;

  return (
    <AuthGate
      title="Weekly Review"
      description="Sign in with Google or LinkedIn to see what moved, what's stuck, and your replanned sprint."
    >
      {isSignedIn && <WeeklyContent />}
    </AuthGate>
  );
}

function WeeklyContent() {
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [due, setDue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/weekly")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setReview(data.review ?? null);
        setDue(Boolean(data.due));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-ink/60">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Weekly Review</h1>
        <p className="mt-1 text-ink/70">
          Auto-generated every 7 days from your daily check-ins.
        </p>
      </div>

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
