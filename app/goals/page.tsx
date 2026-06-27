"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Goal, Profile, EMPTY_PROFILE } from "@/lib/types";
import AuthGate from "@/components/AuthGate";

export default function GoalsPage() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) return <p className="text-ink/60">Loading…</p>;

  return (
    <AuthGate
      title="Activate your goals"
      description="Sign in with Google or LinkedIn to turn your goals into milestones and concrete daily steps."
    >
      {isSignedIn && <GoalsContent />}
    </AuthGate>
  );
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
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/goals")
      .then((r) => r.json())
      .then((data) => setProfile(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-ink/60">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Goals</h1>
        <p className="mt-1 text-ink/70">
          Pick a goal to break it into milestones and steps.
        </p>
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
