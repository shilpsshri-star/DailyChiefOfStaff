"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { DailyLog, DailyResultStatus, EMPTY_DAILY_LOG, Profile, EMPTY_PROFILE } from "@/lib/types";
import AuthGate from "@/components/AuthGate";

function todayKeyClient(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function DailyPage() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) return <p className="text-ink/60">Loading…</p>;

  return (
    <AuthGate
      title="Run today's Daily Loop"
      description="Sign in with Google or LinkedIn to get your 3 focus items each morning and close the loop each evening."
    >
      {isSignedIn && <DailyContent />}
    </AuthGate>
  );
}

type Answer = { status: DailyResultStatus; note: string };

function ActivateGoalCallout({ message }: { message: string }) {
  return (
    <div className="card p-6 text-center">
      <p className="text-ink/70">{message}</p>
      <Link href="/goals" className="btn-primary mt-4 inline-block">
        Activate a Goal
      </Link>
    </div>
  );
}

function DailyContent() {
  const [log, setLog] = useState<DailyLog>(EMPTY_DAILY_LOG(todayKeyClient()));
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});

  async function load() {
    const [logRes, profileRes] = await Promise.all([
      fetch("/api/daily/morning"),
      fetch("/api/goals"),
    ]);
    const data: DailyLog = await logRes.json();
    const profileData: Profile = await profileRes.json();
    setLog(data);
    setProfile(profileData);
    const seeded: Record<string, Answer> = {};
    for (const item of data.focusItems) {
      const existing = data.results.find((r) => r.stepId === item.stepId);
      seeded[item.stepId] = existing
        ? { status: existing.status, note: existing.note }
        : { status: "done", note: "" };
    }
    setAnswers(seeded);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function generateFocus() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/daily/morning", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setLog(data);
      const seeded: Record<string, Answer> = {};
      for (const item of data.focusItems) {
        seeded[item.stepId] = { status: "done", note: "" };
      }
      setAnswers(seeded);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function submitEvening() {
    setSubmitting(true);
    setError(null);
    try {
      const results = log.focusItems.map((item) => ({
        stepId: item.stepId,
        status: answers[item.stepId]?.status ?? "skipped",
        note: answers[item.stepId]?.note ?? "",
      }));
      const res = await fetch("/api/daily/evening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setLog(data.log);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-ink/60">Loading…</p>;

  const hasActiveGoal = profile.goals.some((g) => g.status === "active");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Daily Loop</h1>
        <p className="mt-1 text-ink/70">{log.date}</p>
      </div>

      {error && (
        <div className="card border-red-200 p-4 text-sm text-red-600">{error}</div>
      )}

      {!log.morningGeneratedAt && !hasActiveGoal && (
        <ActivateGoalCallout message="You haven't activated a goal yet — there's nothing to focus on until you do. Break a goal into milestones and steps first." />
      )}

      {!log.morningGeneratedAt && hasActiveGoal && (
        <div className="card p-6 text-center">
          <p className="text-ink/70">
            Get your 3 focus items for today, picked from your active goals.
          </p>
          <button
            className="btn-primary mt-4"
            disabled={generating}
            onClick={generateFocus}
          >
            {generating ? "Thinking…" : "Generate today's focus"}
          </button>
        </div>
      )}

      {log.morningGeneratedAt && log.focusItems.length === 0 && (
        <ActivateGoalCallout message="No active steps to focus on yet — activate a goal to get started." />
      )}

      {log.focusItems.length > 0 && !log.eveningCompletedAt && (
        <section className="space-y-4">
          <h2 className="font-medium">This morning's focus</h2>
          {log.focusItems.map((item, i) => (
            <div key={item.stepId} className="card p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-medium text-white">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wide text-ink/40">
                    {item.goalText} · {item.milestoneText}
                  </p>
                  <p className="mt-1 font-medium">{item.stepText}</p>
                  <p className="mt-1 text-sm text-ink/70">{item.reasoning}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {(["done", "blocked", "skipped"] as DailyResultStatus[]).map(
                      (s) => (
                        <button
                          key={s}
                          type="button"
                          className={
                            "rounded-md px-3 py-1 text-sm capitalize transition-colors " +
                            (answers[item.stepId]?.status === s
                              ? "bg-accent text-white"
                              : "bg-[#f1efe9] text-ink/70 hover:bg-[#e8e6e1]")
                          }
                          onClick={() =>
                            setAnswers((prev) => ({
                              ...prev,
                              [item.stepId]: {
                                status: s,
                                note: prev[item.stepId]?.note ?? "",
                              },
                            }))
                          }
                        >
                          {s}
                        </button>
                      )
                    )}
                  </div>
                  <input
                    className="input mt-2"
                    placeholder="One-line reason…"
                    value={answers[item.stepId]?.note ?? ""}
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [item.stepId]: {
                          status: prev[item.stepId]?.status ?? "done",
                          note: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          ))}

          <button className="btn-primary" disabled={submitting} onClick={submitEvening}>
            {submitting ? "Wrapping up…" : "Submit evening check-in"}
          </button>
        </section>
      )}

      {log.eveningCompletedAt && (
        <section className="space-y-4">
          <h2 className="font-medium">Today's results</h2>
          {log.focusItems.map((item) => {
            const result = log.results.find((r) => r.stepId === item.stepId);
            return (
              <div key={item.stepId} className="card flex items-start justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">{item.stepText}</p>
                  {result?.note && (
                    <p className="mt-1 text-sm text-ink/60">{result.note}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-[#f1efe9] px-2 py-0.5 text-xs capitalize text-ink/70">
                  {result?.status ?? "—"}
                </span>
              </div>
            );
          })}

          {log.adjustmentNote && (
            <div className="card p-5">
              <p className="text-xs uppercase tracking-wide text-ink/40">
                Chief of staff's note
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{log.adjustmentNote}</p>
            </div>
          )}

          <p className="text-sm text-ink/50">
            See you tomorrow morning for your next focus items.
          </p>
        </section>
      )}
    </div>
  );
}
