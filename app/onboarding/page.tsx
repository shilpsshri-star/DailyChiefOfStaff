"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, SignInButton } from "@clerk/nextjs";
import { Profile } from "@/lib/types";
import { genId } from "@/lib/goals";
import {
  ensureGuestMigrated,
  loadGuestProfile,
  saveGuestProfile,
} from "@/lib/guestStore";

const MAX_GOALS = 5;
const AUTOSAVE_DELAY_MS = 700;

export default function OnboardingPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();

  const [goals, setGoals] = useState<string[]>([""]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [completed, setCompleted] = useState(false);
  const wasSignedIn = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonically increasing id for every persistGoals() call. A response
  // is only allowed to overwrite local state if it's still the most recent
  // request issued -- this stops an older, slower-to-resolve save (e.g. the
  // 1-goal request fired before the user added a second goal) from landing
  // *after* a newer save and clobbering it back down to fewer goals.
  const requestSeq = useRef(0);

  // Load the right source of truth: server profile if signed in, otherwise
  // whatever's been saved locally for the guest trial.
  useEffect(() => {
    if (!isLoaded) return;

    async function load() {
      if (isSignedIn) {
        // Just signed in -- migrate any local guest data into Supabase
        // first so the goals we're about to fetch already include it.
        if (!wasSignedIn.current) {
          await ensureGuestMigrated();
        }
        const res = await fetch("/api/goals");
        const profile: Profile = await res.json();
        const texts = profile.goals.map((g) => g.text);
        setGoals(texts.length ? texts : [""]);
      } else {
        const guest = loadGuestProfile();
        const texts = guest.goals.map((g) => g.text);
        setGoals(texts.length ? texts : [""]);
        setCompleted(texts.some((t) => t.trim().length > 0));
      }
      wasSignedIn.current = Boolean(isSignedIn);
      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  // Guests: auto-save to localStorage, preserving any milestones/steps
  // already attached to a goal whose text is unchanged (exact text match,
  // same rule the server-side /api/goals POST uses).
  function syncGuestGoals(texts: string[]) {
    const current = loadGuestProfile();
    const existingByText = new Map(current.goals.map((g) => [g.text, g]));
    const trimmed = texts.map((t) => t.trim()).filter((t) => t.length > 0);
    const nextGoals = trimmed.slice(0, MAX_GOALS).map((text) => {
      const prior = existingByText.get(text);
      if (prior) return prior;
      return {
        id: genId("goal"),
        text,
        createdAt: new Date().toISOString(),
        status: "inactive" as const,
        milestones: [],
      };
    });
    const updated: Profile = { goals: nextGoals, updatedAt: new Date().toISOString() };
    saveGuestProfile(updated);
    setCompleted(nextGoals.length > 0);
  }

  useEffect(() => {
    if (loading || isSignedIn) return;
    syncGuestGoals(goals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goals, loading, isSignedIn]);

  // Signed-in users: auto-save to Supabase (debounced) so goals persist
  // even if the user never clicks the explicit "Save goals" button and
  // instead navigates straight to Goals/Daily Loop via the nav bar.
  useEffect(() => {
    if (loading || !isSignedIn) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      persistGoals(goals).then((ok) => {
        if (ok) setSaved(true);
      });
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goals, loading, isSignedIn]);

  async function persistGoals(current: string[]): Promise<boolean> {
    const seq = ++requestSeq.current;
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals: current }),
      });
      if (!res.ok) return false;
      const profile: Profile = await res.json();
      // Only apply the server's echoed state if no newer save has been
      // kicked off in the meantime -- otherwise this stale response would
      // overwrite goals the user has since added.
      if (seq === requestSeq.current) {
        setGoals(profile.goals.length ? profile.goals.map((g) => g.text) : [""]);
      }
      return true;
    } catch {
      return false;
    }
  }

  function updateGoal(index: number, value: string) {
    setSaved(false);
    setGoals((prev) => prev.map((g, i) => (i === index ? value : g)));
  }

  function addGoal() {
    setGoals((prev) => (prev.length >= MAX_GOALS ? prev : [...prev, ""]));
  }

  function removeGoal(index: number) {
    setSaved(false);
    setGoals((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [""];
    });
  }

  async function save() {
    if (!isSignedIn) return; // guests are auto-saved locally; button is a sign-in CTA for them
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setSaving(true);
    setSaved(false);
    try {
      const ok = await persistGoals(goals);
      setSaved(ok);
    } finally {
      setSaving(false);
    }
  }

  async function goActivate() {
    // Make sure whatever's currently typed is persisted before leaving the
    // page -- don't rely solely on the debounced autosave having fired yet.
    if (isSignedIn) {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      await persistGoals(goals);
    } else {
      syncGuestGoals(goals);
    }
    router.push("/goals");
  }

  if (!isLoaded || loading) {
    return <p className="text-ink/60">Loading your goals…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Onboarding</h1>
        <p className="mt-1 text-ink/70">
          Write down 1 to 5 goals, in whatever words come naturally — no
          structure required. Your chief of staff will turn each one into
          milestones and concrete daily steps once you activate it.
        </p>
        {!isSignedIn && !completed && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            You're trying this out as a guest — your goals are saved in this
            browser only.
          </div>
        )}
      </div>

      {!isSignedIn && completed && (
        <div className="flex flex-col items-start gap-3 rounded-md border border-accent/30 bg-accent/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink">
            Login to save your progress and access it every day.
          </p>
          <SignInButton mode="modal" fallbackRedirectUrl="/onboarding">
            <button className="btn-primary shrink-0 px-4 py-2 text-sm">
              Continue with Google or LinkedIn
            </button>
          </SignInButton>
        </div>
      )}

      <section className="card p-5">
        <h2 className="font-medium">Your goals</h2>
        <p className="mt-1 text-sm text-ink/60">
          Up to {MAX_GOALS}. Just write what you want, in your own words.
          {isSignedIn ? " Saved automatically as you type." : " Saved in this browser as you type."}
        </p>
        <div className="mt-4 space-y-3">
          {goals.map((text, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-sm text-ink/50">{i + 1}.</span>
              <input
                className="input"
                placeholder={`Goal #${i + 1}`}
                value={text}
                onChange={(e) => updateGoal(i, e.target.value)}
              />
              <button
                className="shrink-0 text-sm text-ink/40 hover:text-red-500"
                onClick={() => removeGoal(i)}
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        {goals.length < MAX_GOALS && (
          <button
            className="mt-4 text-sm text-accent hover:underline"
            onClick={addGoal}
            type="button"
          >
            + Add another goal
          </button>
        )}
      </section>

      <div className="flex items-center gap-3">
        {isSignedIn ? (
          <>
            <button className="btn-primary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save goals"}
            </button>
            {saved && <span className="text-sm text-green-600">Saved!</span>}
            <button
              className="text-sm text-accent hover:underline"
              onClick={goActivate}
              type="button"
            >
              Go activate a goal →
            </button>
          </>
        ) : (
          <button
            className="text-sm text-accent hover:underline"
            onClick={goActivate}
            type="button"
          >
            Go activate a goal →
          </button>
        )}
      </div>
    </div>
  );
}
