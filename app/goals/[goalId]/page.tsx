"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { Goal, Milestone, Profile, EMPTY_PROFILE, Step } from "@/lib/types";
import { buildStepsFromInput } from "@/lib/goals";
import {
  ensureGuestMigrated,
  loadGuestProfile,
  saveGuestProfile,
} from "@/lib/guestStore";

export default function GoalDetailPage() {
  const { isLoaded } = useUser();

  if (!isLoaded) return <p className="text-ink/60">Loading…</p>;

  return <GoalDetailContent />;
}

type DraftStep = {
  id?: string;
  text: string;
  resource: string;
  output: string;
  estimatedHours: number;
  dependencies: string[];
};

function GoalDetailContent() {
  const { isSignedIn } = useUser();
  const params = useParams<{ goalId: string }>();
  const router = useRouter();
  const goalId = params.goalId;
  void router;

  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasSignedIn = useRef(false);

  const [draftMilestones, setDraftMilestones] = useState<
    { id?: string; text: string }[] | null
  >(null);
  const [draftSteps, setDraftSteps] = useState<DraftStep[] | null>(null);
  const [draftMilestoneId, setDraftMilestoneId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  async function load() {
    if (isSignedIn) {
      if (!wasSignedIn.current) await ensureGuestMigrated();
      const res = await fetch("/api/goals");
      const data: Profile = await res.json();
      setProfile(data);
    } else {
      setProfile(loadGuestProfile());
    }
    wasSignedIn.current = Boolean(isSignedIn);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

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

  // Saves a goal mutation locally for guests: replaces this goal within the
  // profile, persists to localStorage, and updates component state -- the
  // guest-mode equivalent of the signed-in await load() after a server save.
  function applyGuestGoalUpdate(updatedGoal: Goal) {
    const updatedProfile: Profile = {
      ...profile,
      goals: profile.goals.map((g) => (g.id === goal!.id ? updatedGoal : g)),
      updatedAt: new Date().toISOString(),
    };
    saveGuestProfile(updatedProfile);
    setProfile(updatedProfile);
  }

  // Pure helper: returns a new Profile with one step's notes replaced.
  // Shared by both the signed-in (after a successful PATCH) and guest
  // (immediate localStorage write) save paths below.
  function updateStepNotesInProfile(
    p: Profile,
    milestoneId: string,
    stepId: string,
    notes: string
  ): Profile {
    return {
      ...p,
      goals: p.goals.map((g) =>
        g.id !== goalId
          ? g
          : {
              ...g,
              milestones: g.milestones.map((m) =>
                m.id !== milestoneId
                  ? m
                  : {
                      ...m,
                      steps: m.steps.map((s) =>
                        s.id === stepId ? { ...s, notes } : s
                      ),
                    }
              ),
            }
      ),
    };
  }

  async function saveStepNotes(milestoneId: string, stepId: string, notes: string) {
    if (isSignedIn) {
      try {
        const res = await fetch(
          `/api/goals/${goalId}/milestones/${milestoneId}/steps/${stepId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes }),
          }
        );
        if (!res.ok) {
          setError("Couldn't save your note. Try again.");
          return;
        }
        setProfile((prev) => updateStepNotesInProfile(prev, milestoneId, stepId, notes));
      } catch {
        setError("Couldn't reach the server. Try again.");
      }
    } else {
      const updatedProfile = updateStepNotesInProfile(profile, milestoneId, stepId, notes);
      saveGuestProfile(updatedProfile);
      setProfile(updatedProfile);
    }
  }

  const proposedMilestones = goal.milestones.filter((m) => m.status === "proposed");
  const confirmedMilestones = goal.milestones
    .filter((m) => m.status !== "proposed")
    .sort((a, b) => a.order - b.order);
  const allMilestonesDone =
    confirmedMilestones.length > 0 &&
    confirmedMilestones.every((m) => m.status === "completed");

  async function generateMilestones() {
    setBusy(true);
    setError(null);
    try {
      if (isSignedIn) {
        const res = await fetch(`/api/goals/${goalId}/milestones`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Couldn't generate milestones.");
          return;
        }
        await load();
        const milestones: Milestone[] = data.milestones ?? [];
        setDraftMilestones(milestones.map((m) => ({ id: m.id, text: m.text })));
      } else {
        const res = await fetch(`/api/goals/${goalId}/milestones`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goalText: goal!.text }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Couldn't generate milestones.");
          return;
        }
        const milestones: Milestone[] = data.milestones ?? [];
        applyGuestGoalUpdate({ ...goal!, milestones });
        setDraftMilestones(milestones.map((m) => ({ id: m.id, text: m.text })));
      }
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
      if (isSignedIn) {
        // Confirming kicks off step generation for EVERY milestone on the
        // server side (in parallel) -- this can take a few seconds longer
        // than a single-milestone call used to.
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
      } else {
        const res = await fetch(`/api/goals/${goalId}/milestones`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goalText: goal!.text, milestones: draftMilestones }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Couldn't save milestones.");
          return;
        }
        const milestones: Milestone[] = data.milestones ?? [];
        applyGuestGoalUpdate({ ...goal!, milestones, status: data.goalStatus ?? "active" });
        setDraftMilestones(null);
      }
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function toDraftSteps(steps: Step[]): DraftStep[] {
    return steps
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        id: s.id,
        text: s.text,
        resource: s.resource,
        output: s.output,
        estimatedHours: s.estimatedHours,
        dependencies: s.dependencies,
      }));
  }

  async function generateSteps(milestoneId: string) {
    setBusy(true);
    setError(null);
    try {
      if (isSignedIn) {
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
        setDraftSteps(toDraftSteps(steps));
      } else {
        const milestone = goal!.milestones.find((m) => m.id === milestoneId);
        if (!milestone) return;
        const res = await fetch(
          `/api/goals/${goalId}/milestones/${milestoneId}/steps`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ goalText: goal!.text, milestoneText: milestone.text }),
          }
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Couldn't generate steps.");
          return;
        }
        const steps: Step[] = data.steps ?? [];
        applyGuestGoalUpdate({
          ...goal!,
          milestones: goal!.milestones.map((m) =>
            m.id === milestoneId ? { ...m, steps } : m
          ),
        });
        setDraftMilestoneId(milestoneId);
        setDraftSteps(toDraftSteps(steps));
      }
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function editSteps(milestoneId: string, steps: Step[]) {
    setError(null);
    setDraftMilestoneId(milestoneId);
    setDraftSteps(toDraftSteps(steps));
  }

  async function confirmSteps() {
    if (!draftSteps || !draftMilestoneId) return;
    setBusy(true);
    setError(null);
    try {
      if (isSignedIn) {
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
      } else {
        // Pure cleaning, no AI call -- run the same logic the server uses
        // (lib/goals.ts) directly, no network round trip needed.
        const milestone = goal!.milestones.find((m) => m.id === draftMilestoneId);
        if (!milestone) return;
        const cleanedSteps = buildStepsFromInput(milestone.steps, draftSteps);
        applyGuestGoalUpdate({
          ...goal!,
          status: goal!.status === "completed" ? goal!.status : "active",
          milestones: goal!.milestones.map((m) =>
            m.id === draftMilestoneId
              ? { ...m, steps: cleanedSteps, status: "confirmed" }
              : m
          ),
        });
        setDraftSteps(null);
        setDraftMilestoneId(null);
      }
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

      {!isSignedIn && (
        <div className="flex flex-col items-start gap-3 rounded-md border border-accent/30 bg-accent/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink">
            Login to save your progress and access it every day.
          </p>
          <SignInButton mode="modal" fallbackRedirectUrl={`/goals/${goalId}`}>
            <button className="btn-primary shrink-0 px-4 py-2 text-sm">
              Continue with Google or LinkedIn
            </button>
          </SignInButton>
        </div>
      )}

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
            Edit any text, then confirm. Confirming generates 5-7 concrete
            steps for every milestone at once.
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
              {busy ? "Generating steps for every milestone…" : "Confirm milestones"}
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

      {/* Step 2: steps for every confirmed milestone */}
      {!draftMilestones && confirmedMilestones.length > 0 && (
        <section className="card p-5">
          <h2 className="font-medium">Milestones &amp; steps</h2>
          <p className="mt-1 text-sm text-ink/60">
            Steps are generated for every milestone as soon as it's confirmed.
          </p>
          <div className="mt-4 space-y-5">
            {confirmedMilestones.map((m, i) => {
              const isEditingThis = draftSteps && draftMilestoneId === m.id;
              return (
                <div key={m.id} className="rounded-md border border-[#e8e6e1] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {i + 1}. {m.text}
                    </span>
                    <span
                      className={
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium " +
                        (m.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : "bg-accent/10 text-accent")
                      }
                    >
                      {m.status === "completed"
                        ? "done"
                        : `${m.steps.filter((s) => s.status === "done").length}/${m.steps.length} steps`}
                    </span>
                  </div>

                  {m.steps.length === 0 && !isEditingThis && (
                    <div className="mt-3">
                      <p className="text-sm text-ink/60">
                        No steps yet — generation may have hit an error.
                      </p>
                      <button
                        className="btn-primary mt-2"
                        disabled={busy}
                        onClick={() => generateSteps(m.id)}
                      >
                        {busy ? "Thinking…" : "Generate steps"}
                      </button>
                    </div>
                  )}

                  {m.steps.length > 0 && !isEditingThis && (
                    <>
                      <ul className="mt-3 space-y-2">
                        {m.steps
                          .slice()
                          .sort((a, b) => a.order - b.order)
                          .map((s) => (
                            <li
                              key={s.id}
                              className="rounded-md bg-[#f7f6f2] p-3 text-sm"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <span className="font-medium">{s.text}</span>
                                <span className="shrink-0 rounded-full bg-[#f1efe9] px-2 py-0.5 text-xs text-ink/60">
                                  {s.status}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-ink/60">
                                {s.resource && (
                                  <span>Resource: {s.resource} · </span>
                                )}
                                {s.output && <span>Output: {s.output} · </span>}
                                <span>{s.estimatedHours}h estimated</span>
                              </div>
                              <textarea
                                className="input mt-2 w-full text-xs"
                                rows={2}
                                placeholder="Notes — save a link, a finding, anything worth remembering for next time…"
                                value={noteDrafts[s.id] ?? s.notes ?? ""}
                                onChange={(e) =>
                                  setNoteDrafts((prev) => ({
                                    ...prev,
                                    [s.id]: e.target.value,
                                  }))
                                }
                                onBlur={(e) => {
                                  const value = e.target.value;
                                  if (value !== (s.notes ?? "")) {
                                    saveStepNotes(m.id, s.id, value);
                                  }
                                }}
                              />
                            </li>
                          ))}
                      </ul>
                      <button
                        className="mt-3 text-sm text-ink/50 hover:text-accent"
                        disabled={busy}
                        onClick={() => editSteps(m.id, m.steps)}
                        type="button"
                      >
                        Edit steps
                      </button>
                    </>
                  )}

                  {isEditingThis && draftSteps && (
                    <div className="mt-4">
                      <p className="text-sm text-ink/60">
                        Each step needs a concrete action, a resource, a clear
                        output, and an hour estimate. Edit, then confirm.
                      </p>
                      <div className="mt-3 space-y-4">
                        {draftSteps.map((s, si) => (
                          <div
                            key={s.id ?? si}
                            className="rounded-md border border-[#e8e6e1] p-3"
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-5 shrink-0 text-sm text-ink/50">
                                {si + 1}.
                              </span>
                              <input
                                className="input"
                                placeholder="Step (a concrete action)"
                                value={s.text}
                                onChange={(e) =>
                                  setDraftSteps((prev) =>
                                    prev
                                      ? prev.map((x, idx) =>
                                          idx === si
                                            ? { ...x, text: e.target.value }
                                            : x
                                        )
                                      : prev
                                  )
                                }
                              />
                            </div>
                            <div className="mt-2 grid grid-cols-[1fr,1fr] gap-2 pl-8">
                              <input
                                className="input"
                                placeholder="Resource or tool"
                                value={s.resource}
                                onChange={(e) =>
                                  setDraftSteps((prev) =>
                                    prev
                                      ? prev.map((x, idx) =>
                                          idx === si
                                            ? { ...x, resource: e.target.value }
                                            : x
                                        )
                                      : prev
                                  )
                                }
                              />
                              <input
                                className="input"
                                placeholder="Output (what 'done' looks like)"
                                value={s.output}
                                onChange={(e) =>
                                  setDraftSteps((prev) =>
                                    prev
                                      ? prev.map((x, idx) =>
                                          idx === si
                                            ? { ...x, output: e.target.value }
                                            : x
                                        )
                                      : prev
                                  )
                                }
                              />
                            </div>
                            <div className="mt-2 grid grid-cols-[7rem] gap-2 pl-8">
                              <input
                                className="input"
                                type="number"
                                min={0.25}
                                step={0.25}
                                placeholder="Hours"
                                value={s.estimatedHours}
                                onChange={(e) =>
                                  setDraftSteps((prev) =>
                                    prev
                                      ? prev.map((x, idx) =>
                                          idx === si
                                            ? {
                                                ...x,
                                                estimatedHours:
                                                  Number(e.target.value) || 1,
                                              }
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
                        <button
                          className="btn-primary"
                          disabled={busy}
                          onClick={confirmSteps}
                        >
                          {busy ? "Saving…" : "Confirm steps"}
                        </button>
                        <button
                          className="text-sm text-ink/50 hover:text-accent"
                          disabled={busy}
                          onClick={() => generateSteps(m.id)}
                          type="button"
                        >
                          Regenerate
                        </button>
                        <button
                          className="text-sm text-ink/50 hover:text-accent"
                          disabled={busy}
                          onClick={() => {
                            setDraftSteps(null);
                            setDraftMilestoneId(null);
                          }}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {proposedMilestones.length > 0 && (
            <p className="mt-3 text-xs text-ink/40">
              ({proposedMilestones.length} proposed milestone(s) not yet confirmed —
              regenerate above to review them.)
            </p>
          )}
          <Link
            href="/daily"
            className="mt-4 inline-block text-sm text-accent hover:underline"
          >
            Go run today's Daily Loop →
          </Link>
        </section>
      )}

      {!draftMilestones && allMilestonesDone && (
        <div className="card p-6 text-center text-green-700">
          🎉 Every milestone on this goal is complete.
        </div>
      )}
    </div>
  );
}
