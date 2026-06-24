"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Briefing } from "@/lib/types";
import AuthGate from "@/components/AuthGate";

export default function BriefingPage() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) return <p className="text-ink/60">Loading…</p>;

  return (
    <AuthGate
      title="Your Morning Briefing is waiting"
      description="Sign in with Google or LinkedIn to unlock daily AI-generated priorities based on your goals and tasks."
    >
      {isSignedIn && <BriefingContent />}
    </AuthGate>
  );
}

function BriefingContent() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/briefing")
      .then((r) => r.json())
      .then((data) => setBriefing(data))
      .finally(() => setLoading(false));
  }, []);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/briefing", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setBriefing(data);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Morning Briefing</h1>
          <p className="mt-1 text-ink/70">
            Your top 3 priorities for today, with reasoning.
          </p>
        </div>
        <button className="btn-primary" disabled={generating} onClick={generate}>
          {generating
            ? "Thinking…"
            : briefing
            ? "Regenerate"
            : "Generate today's briefing"}
        </button>
      </div>

      {error && (
        <div className="card border-red-200 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-ink/60">Loading…</p>
      ) : !briefing ? (
        <div className="card p-6 text-center text-ink/60">
          No briefing yet today. Click "Generate today's briefing" above.
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-wide text-ink/40">
            {briefing.date}
          </p>
          {briefing.priorities.length === 0 ? (
            <div className="card p-5 text-sm text-ink/70 whitespace-pre-wrap">
              {briefing.raw}
            </div>
          ) : (
            briefing.priorities.map((p, i) => (
              <div key={i} className="card p-5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-medium text-white">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium">{p.task}</p>
                    <p className="mt-1 text-sm text-ink/70">{p.reasoning}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
