"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, SignInButton } from "@clerk/nextjs";
import { EMPTY_PROFILE, Goal, Profile, Task } from "@/lib/types";
import { loadDraft, saveDraft, clearDraft, hasDraft } from "@/lib/localDraft";

export default function OnboardingPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();

  const [goals, setGoals] = useState<Goal[]>(EMPTY_PROFILE.goals);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const wasSignedIn = useRef(false);

  // Load the right source of truth: server profile if signed in, otherwise
  // whatever's been drafted locally during the free trial.
  useEffect(() => {
    if (!isLoaded) return;

    async function load() {
      if (isSignedIn) {
        // Just signed in and there's a local draft from the trial? Migrate it.
        if (!wasSignedIn.current && hasDraft()) {
          const draft = loadDraft();
          await fetch("/api/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(draft),
          });
          clearDraft();
        }
        const res = await fetch("/api/profile");
        const profile: Profile = await res.json();
        setGoals(profile.goals);
        setTasks(profile.tasks ?? []);
      } else {
        const draft = loadDraft();
        setGoals(draft.goals);
        setTasks(draft.tasks ?? []);
      }
      wasSignedIn.current = Boolean(isSignedIn);
      setLoading(false);
    }

    load();
  }, [isLoaded, isSignedIn]);

  // Auto-save to localStorage for guests, so the trial never loses work.
  useEffect(() => {
    if (loading || isSignedIn) return;
    saveDraft({ goals, tasks, updatedAt: new Date().toISOString() });
  }, [goals, tasks, loading, isSignedIn]);

  function updateGoalText(index: number, value: string) {
    setGoals((prev) =>
      prev.map((g, i) => (i === index ? { ...g, text: value } : g))
    );
  }

  function toggleGoalAchieved(index: number) {
    setGoals((prev) =>
      prev.map((g, i) => (i === index ? { ...g, achieved: !g.achieved } : g))
    );
  }

  function addTask() {
    const text = newTask.trim();
    if (!text) return;
    setTasks((prev) => [
      ...prev,
      { id: `task-${Date.now()}`, text, done: false },
    ]);
    setNewTask("");
  }

  function removeTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  async function save() {
    if (!isSignedIn) return; // guests are auto-saved locally; button is a sign-in CTA for them
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals, tasks }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (!isLoaded || loading) {
    return <p className="text-ink/60">Loading your profile…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Onboarding</h1>
        <p className="mt-1 text-ink/70">
          Set your 5 goals and your task list. Your chief of staff will use these
          everywhere — briefings, chat, and end-of-day summaries.
        </p>
        {!isSignedIn && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            You're trying this out as a guest — your goals and tasks are saved
            in this browser only. Sign in with Google or LinkedIn any time to
            save permanently and unlock Briefing, Chat, End of Day, and your
            Dashboard.
          </div>
        )}
      </div>

      <section className="card p-5">
        <h2 className="font-medium">Your 5 goals</h2>
        <p className="mt-1 text-sm text-ink/60">
          Rank them in priority order — #1 matters most. Check a goal off once
          you've achieved it.
        </p>
        <div className="mt-4 space-y-3">
          {goals.map((goal, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-sm text-ink/50">{i + 1}.</span>
              <input
                className="input"
                placeholder={`Goal #${i + 1}`}
                value={goal.text}
                onChange={(e) => updateGoalText(i, e.target.value)}
              />
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink/60">
                <input
                  type="checkbox"
                  checked={goal.achieved}
                  onChange={() => toggleGoalAchieved(i)}
                  disabled={!goal.text.trim()}
                />
                Achieved
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-medium">Your tasks</h2>
        <p className="mt-1 text-sm text-ink/60">
          Add everything on your plate — your chief of staff will help you sort it.
        </p>

        <div className="mt-4 flex gap-2">
          <input
            className="input"
            placeholder="Add a task and press Enter"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTask();
              }
            }}
          />
          <button className="btn-primary" onClick={addTask} type="button">
            Add
          </button>
        </div>

        <ul className="mt-4 space-y-2">
          {tasks.length === 0 && (
            <p className="text-sm text-ink/50">No tasks yet.</p>
          )}
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between rounded-md border border-[#e8e6e1] px-3 py-2"
            >
              <span className="text-sm">{task.text}</span>
              <button
                className="text-sm text-ink/40 hover:text-red-500"
                onClick={() => removeTask(task.id)}
                type="button"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex items-center gap-3">
        {isSignedIn ? (
          <>
            <button className="btn-primary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && <span className="text-sm text-green-600">Saved!</span>}
            <button
              className="text-sm text-accent hover:underline"
              onClick={() => router.push("/briefing")}
              type="button"
            >
              Go to Morning Briefing →
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
