"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { EndOfDaySummary, Profile, EMPTY_PROFILE } from "@/lib/types";
import AuthGate from "@/components/AuthGate";

export default function EndOfDayPage() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) return <p className="text-ink/60">Loading…</p>;

  return (
    <AuthGate
      title="Wrap up your day"
      description="Sign in with Google or LinkedIn to check off today's tasks and get an AI summary plus a nudge for tomorrow."
    >
      {isSignedIn && <EndOfDayContent />}
    </AuthGate>
  );
}

function EndOfDayContent() {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [eod, setEod] = useState<EndOfDaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/eod")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data.profile ?? EMPTY_PROFILE);
        setEod(data.eod ?? null);
        const alreadyDone = new Set<string>(
          (data.profile?.tasks ?? [])
            .filter((t: { done: boolean }) => t.done)
            .map((t: { id: string }) => t.id)
        );
        setChecked(alreadyDone);
      })
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/eod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedTaskIds: Array.from(checked) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setProfile(data.profile);
      setEod(data.eod);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <p className="text-ink/60">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">End of Day</h1>
        <p className="mt-1 text-ink/70">
          Check off what you got done. Your chief of staff will sum up the day.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="font-medium">Your tasks</h2>
        {profile.tasks.length === 0 ? (
          <p className="mt-2 text-sm text-ink/50">
            No tasks yet — add some on the Onboarding page.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {profile.tasks.map((task) => (
              <li key={task.id} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={checked.has(task.id)}
                  onChange={() => toggle(task.id)}
                />
                <span
                  className={
                    "text-sm " +
                    (checked.has(task.id) ? "text-ink/40 line-through" : "")
                  }
                >
                  {task.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button className="btn-primary" disabled={generating} onClick={generate}>
        {generating ? "Wrapping up…" : "Generate end-of-day summary"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {eod && (
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wide text-ink/40">
            {eod.date}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{eod.summary}</p>
        </div>
      )}
    </div>
  );
}
