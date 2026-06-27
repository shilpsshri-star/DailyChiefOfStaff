"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Goal, Milestone, Profile, EMPTY_PROFILE, Step } from "@/lib/types";
import AuthGate from "@/components/AuthGate";

function getActiveMilestone(goal: Goal): Milestone | null {
  const confirmed = goal.milestones
    .filter((m) => m.status !== "proposed")
    .sort((a, b) => a.order - b.order);
  return confirmed.find((m) => m.status !== "completed") ?? null;
}

export default function GoalDetailPage() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) return <p className="text-ink/60">Loading…</p>;

  return (
    <AuthGate
      title="Activate this goal"
      description="Sign in with Google or LinkedIn to break this goal into milestones and steps."
    >
      {isSignedIn && <GoalDetailContent />}
    </AuthGate>
  );
}

function GoalDetailContent() {
  const params = useParams<{ goalId: string }>();
  const router = useRouter();
  const goalId = params.goalId;

  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftMilestones, setDraftMilestones] = useState<
    { id?: string; text: string }[] | null
  >(null);
  const [draftSteps, setDraftSteps] = useState<
    | {
        id?: string;
        text: string;
        output: string;
        estimatedDays: number;
        dependencies: string[];
      }[]
    | null
  >(null);
  const [draftMilestoneId, setDraftMilestoneId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/goals");
    const data: Profile = await res.json();
    setProfile(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const goal = profile.goals.find((g) => g.id === goalId);

  if (loading) return <p className="text-ink/60">Loading…</p>;

  if (!goal) {
    return (
      <div className="card p-6 text-center text-ink/60">
        Couldn't find that goal.{" "}
        <Link href="/goals" className="text-accent hover:underline">
          Back to Goals
        </Link>
      </div>
    );
  }

  const proposedMilestones = goal.milestones.filter((m) => m.status === "proposed");
  const confirmedMilestones = goal.milestones
    .filter((m) => m.status !== "proposed")
    .sort((a, b) => a.order - b.order);
  const activeMilestone = getActiveMilestone(goal);

  async function generateMilestones() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/goals/${goalId}/milestones`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't generate milestones.");
        return;
      }
      await load();
      const milestones: Milestone[] = data.milestones ?? [];
      setDraftMilestones(milestones.map((m) => ({ id: m.id, text: m.text })));
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmMilestones() {
    if (!draftMilestones) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/goals/${goalId}/milestones`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestones: draftMilestones }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't save milestones.");
        return;
      }
      setDraftMilestones(null);
      await load();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function generateSteps(milestoneId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/goals/${goalId}/milestones/${milestoneId}/steps`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't generate steps.");
        return;
      }
      await load();
      const steps: Step[] = data.steps ?? [];
      setDraftMilestoneId(milestoneId);
      setDraftSteps(
        steps.map((s) => ({
          id: s.id,
          text: s.text,
          output: s.output,
          estimatedDays: s.estimatedDays,
          dependencies: s.dependencies,
        }))
      );
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSteps() {
    if (!draftSteps || !draftMilestoneId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/goals/${goalId}/milestones/${draftMilestoneId}/steps`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ steps: draftSteps }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't save steps.");
        return;
      }
      setDraftSteps(null);
      setDraftMilestoneId(null);
      await load();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/goals" className="text-sm text-accent hover:underline">
          ← Back to Goals
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{goal.text}</h1>
        <p className="mt-1 text-sm text-ink/60">Status: {goal.status}</p>
      </div>

      {error && (
        <div className="card border-red-200 p-4 text-sm text-red-600">{error}</div>
      )}

      {/* Step 1: milestones */}
      {goal.milestones.length === 0 && !draftMilestones && (
        <div className="card p-6 text-center">
          <p className="text-ink/70">
            This goal hasn't been broken down yet.
          </p>
          <button
            className="btn-primary mt-4"
            disabled={busy}
            onClick={generateMilestones}
          >
            {busy ? "Thinking…" : "Break into milestones"}
          </button>
        </div>
      )}

      {draftMilestones && (
        <section className="card p-5">
          <h2 className="font-medium">Confirm your milestones</h2>
          <p className="mt-1 text-sm text-ink/60">
            Edit any text, then confirm to activate this goal.
          </p>
          <div className="mt-4 space-y-3">
            {draftMilestones.map((m, i) => (
              <div key={m.id ?? i} className="flex items-center gap-3">
                <span className="w-5 shrink-0 text-sm text-ink/50">{i + 1}.</span>
                <input
                  className="input"
                  value={m.text}
                  onChange={(e) =>
                    setDraftMilestones((prev) =>
                      prev
                        ? prev.map((x, idx) =>
                            idx === i ? { ...x, text: e.target.value } : x
                          )
                        : prev
                    )
                  }
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <button className="btn-primary" disabled={busy} onClick={confirmMilestones}>
              {busy ? "Saving…" : "Confirm milestones"}
            </button>
            <button
              className="text-sm text-ink/50 hover:text-accent"
              disabled={busy}
              onClick={generateMilestones}
              type="button"
            >
              Regenerate
            </button>
          </div>
        </section>
      )}

      {!draftMilestones && confirmedMilestones.length > 0 && (
        <section className="card p-5">
          <h2 className="font-medium">Milestones</h2>
          <ul className="mt-3 space-y-2">
            {confirmedMilestones.map((m, i) => (
              <li key={m.id} className="flex items-center justify-between">
                <span className="text-sm">
                  {i + 1}. {m.text}
                </span>
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-xs font-medium " +
                    (m.status === "completed"
                      ? "bg-green-100 text-green-700"
                      : "bg-accent/10 text-accent")
                  }
                >
                  {m.status === "completed"
                    ? "done"
                    : `${m.steps.filter((s) => s.status === "done").length}/${m.steps.length} steps`}
                </span>
              </li>
            ))}
          </ul>
          {proposedMilestones.length > 0 && (
            <p className="mt-3 text-xs text-ink/40">
              ({proposedMilestones.length} proposed milestone(s) not yet confirmed —
              regenerate above to review them.)
            </p>
          )}
        </section>
      )}

      {/* Step 2: steps for the active milestone */}
      {!draftMilestones && activeMilestone && activeMilestone.steps.length === 0 && (
        <div className="card p-6 text-center">
          <p className="text-ink/70">
            Next up: break "{activeMilestone.text}" into concrete steps.
          </p>
          <button
            className="btn-primary mt-4"
            disabled={busy}
            onClick={() => generateSteps(activeMilestone.id)}
          >
            {busy ? "Thinking…" : "Break into steps"}
          </button>
        </div>
      )}

      {draftSteps && draftMilestoneId && (
        <section className="card p-5">
          <h2 className="font-medium">Confirm your steps</h2>
          <p className="mt-1 text-sm text-ink/60">
            Each step needs a clear output and a day estimate. Edit, then
            confirm to activate.
          </p>
          <div className="mt-4 space-y-4">
            {draftSteps.map((s, i) => (
              <div key={s.id ?? i} className="rounded-md border border-[#e8e6e1] p-3">
                <div className="flex items-center gap-3">
                  <span className="w-5 shrink-0 text-sm text-ink/50">{i + 1}.</span>
                  <input
                    className="input"
                    placeholder="Step"
                    value={s.text}
                    onChange={(e) =>
                      setDraftSteps((prev) =>
                        prev
                          ? prev.map((x, idx) =>
                              idx === i ? { ...x, text: e.target.value } : x
                            )
                          : prev
                      )
                    }
                  />
                </div>
                <div className="mt-2 grid grid-cols-[1fr,7rem] gap-2 pl-8">
                  <input
                    className="input"
                    placeholder="Output (what 'done' looks like)"
                    value={s.output}
                    onChange={(e) =>
                      setDraftSteps((prev) =>
                        prev
                          ? prev.map((x, idx) =>
                              idx === i ? { ...x, output: e.target.value } : x
                            )
                          : prev
                      )
                    }
                  />
                  <input
                    className="input"
                    type="number"
                    min={1}
                    placeholder="Days"
                    value={s.estimatedDays}
                    onChange={(e) =>
                      setDraftSteps((prev) =>
                        prev
                          ? prev.map((x, idx) =>
                              idx === i
                                ? { ...x, estimatedDays: Number(e.target.value) || 1 }
                                : x
                            )
                          : prev
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <button className="btn-primary" disabled={busy} onClick={confirmSteps}>
              {busy ? "Saving…" : "Confirm steps"}
            </button>
            <button
              className="text-sm text-ink/50 hover:text-accent"
              disabled={busy}
              onClick={() => generateSteps(draftMilestoneId)}
              type="button"
            >
              Regenerate
            </button>
          </div>
        </section>
      )}

      {!draftMilestones &&
        !draftSteps &&
        activeMilestone &&
        activeMilestone.steps.length > 0 && (
          <section className="card p-5">
            <h2 className="font-medium">Steps for "{activeMilestone.text}"</h2>
            <ul className="mt-3 space-y-2">
              {activeMilestone.steps
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3">
                    <span className="text-sm">{s.text}</span>
                    <span className="shrink-0 rounded-full bg-[#f1efe9] px-2 py-0.5 text-xs text-ink/60">
                      {s.status}
                    </span>
                  </li>
                ))}
            </ul>
            <Link
              href="/daily"
              className="mt-4 inline-block text-sm text-accent hover:underline"
            >
              Go run today's Daily Loop →
            </Link>
          </section>
        )}

      {!draftMilestones && !activeMilestone && confirmedMilestones.length > 0 && (
        <div className="card p-6 text-center text-green-700">
          🎉 Every milestone on this goal is complete.
        </div>
      )}
    </div>
  );
}
