"use client";

import { useEffect, useRef, useState } from "react";
import { useUser, SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { Goal, Profile, EMPTY_PROFILE } from "@/lib/types";
import { ensureGuestMigrated, loadGuestProfile } from "@/lib/guestStore";

export default function GoalsPage() {
  const { isLoaded } = useUser();

  if (!isLoaded) return <p className="text-ink/60">Loading…</p>;

  return <GoalsContent />;
}

function statusBadge(status: Goal["status"]) {
  const styles: Record<Goal["status"], string> = {
    inactive: "bg-[#f1efe9] text-ink/60",
    active: "bg-accent/10 text-accent",
    completed: "bg-green-100 text-green-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

function GoalsContent() {
  const { isSignedIn } = useUser();
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const wasSignedIn = useRef(false);

  useEffect(() => {
    async function load() {
      if (isSignedIn) {
        if (!wasSignedIn.current) await ensureGuestMigrated();
        const res = await fetch("/api/goals");
        setProfile(await res.json());
      } else {
        setProfile(loadGuestProfile());
      }
      wasSignedIn.current = Boolean(isSignedIn);
      setLoading(false);
    }
    load();
  }, [isSignedIn]);

  if (loading) return <p className="text-ink/60">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Goals</h1>
        <p className="mt-1 text-ink/70">
          Pick a goal to break it into milestones and steps.
        </p>
        {!isSignedIn && (
          <div className="mt-3 flex flex-col items-start gap-3 rounded-md border border-accent/30 bg-accent/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink">
              Login to save your progress and access it every day.
            </p>
            <SignInButton mode="modal" fallbackRedirectUrl="/goals">
              <button className="btn-primary shrink-0 px-4 py-2 text-sm">
                Continue with Google or LinkedIn
              </button>
            </SignInButton>
          </div>
        )}
      </div>

      {profile.goals.length === 0 ? (
        <div className="card p-6 text-center text-ink/60">
          No goals yet.{" "}
          <Link href="/onboarding" className="text-accent hover:underline">
            Add some on Onboarding
          </Link>
          .
        </div>
      ) : (
        <div className="space-y-3">
          {profile.goals.map((goal) => {
            const confirmedMilestones = goal.milestones.filter(
              (m) => m.status !== "proposed"
            );
            const doneMilestones = confirmedMilestones.filter(
              (m) => m.status === "completed"
            );
            return (
              <Link
                key={goal.id}
                href={`/goals/${goal.id}`}
                className="card block p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{goal.text}</p>
                  {statusBadge(goal.status)}
                </div>
                <p className="mt-1 text-sm text-ink/60">
                  {goal.milestones.length === 0
                    ? "Not broken down yet"
                    : `${doneMilestones.length}/${confirmedMilestones.length} milestones done`}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
