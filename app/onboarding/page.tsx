"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, SignInButton } from "@clerk/nextjs";
import { Profile } from "@/lib/types";
import {
  loadDraftGoals,
  saveDraftGoals,
  clearDraftGoals,
  hasDraftGoals,
} from "@/lib/localDraft";

const MAX_GOALS = 5;
const AUTOSAVE_DELAY_MS = 700;

export default function OnboardingPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();

  const [goals, setGoals] = useState<string[]>([""]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const wasSignedIn = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the right source of truth: server profile if signed in, otherwise
  // whatever's been drafted locally during the free trial.
  useEffect(() => {
    if (!isLoaded) return;

    async function load() {
      if (isSignedIn) {
        // Just signed in and there's a local draft from the trial? Migrate it.
        if (!wasSignedIn.current && hasDraftGoals()) {
          const draft = loadDraftGoals();
          if (draft.some((g) => g.trim())) {
            await fetch("/api/goals", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ goals: draft }),
            });
          }
          clearDraftGoals();
        }
        const res = await fetch("/api/goals");
        const profile: Profile = await res.json();
        const texts = profile.goals.map((g) => g.text);
        setGoals(texts.length ? texts : [""]);
      } else {
        const draft = loadDraftGoals();
        setGoals(draft.length ? draft : [""]);
      }
      wasSignedIn.current = Boolean(isSignedIn);
      setLoading(false);
    }

    load();
  }, [isLoaded, isSignedIn]);

  // Guests: auto-save to localStorage so the trial never loses work.
  useEffect(() => {
    if (loading || isSignedIn) return;
    saveDraftGoals(goals);
  }, [goals, loading, isSignedIn]);

  // Signed-in users: auto-save to Vercel KV (debounced) so goals persist
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
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals: current }),
      });
      if (!res.ok) return false;
      const profile: Profile = await res.json();
      setGoals(profile.goals.length ? profile.goals.map((g) => g.text) : [""]);
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
    // page — don't rely solely on the debounced autosave having fired yet.
    if (isSignedIn) {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      await persistGoals(goals);
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
        {!isSignedIn && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            You're trying this out as a guest — your goals are saved in this
            browser only. Sign in with Google or LinkedIn any time to save
            permanently and unlock activation, the daily loop, and your
            Dashboard.
          </div>
        )}
      </div>

      <section className="card p-5">
        <h2 className="font-medium">Your goals</h2>
        <p className="mt-1 text-sm text-ink/60">
          Up to {MAX_GOALS}. Just write what you want, in your own words.
          {isSignedIn && " Saved automatically as you type."}
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
          <>
            <SignInButton mode="modal">
              <button className="btn-primary">
                Sign in to save permanently
              </button>
            </SignInButton>
            <span className="text-sm text-ink/50">
              (already auto-saved in this browser)
            </span>
          </>
        )}
      </div>
    </div>
  );
}
