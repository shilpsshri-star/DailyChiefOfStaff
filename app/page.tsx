import Link from "next/link";

const steps = [
  {
    href: "/onboarding",
    title: "1. Onboarding",
    desc: "Write 1-5 goals in free text, no structure required. Do this once, update anytime.",
  },
  {
    href: "/goals",
    title: "2. Activate a goal",
    desc: "Your chief of staff breaks a goal into 3-5 milestones, then the first milestone into 5-7 concrete steps. You confirm or edit before anything goes live.",
  },
  {
    href: "/daily",
    title: "3. Daily Loop",
    desc: "Each morning it picks 3 focus items from your active steps and explains why. Each evening you mark done, blocked, or skipped with a one-line reason, and it adjusts the plan.",
  },
  {
    href: "/weekly",
    title: "4. Weekly Review",
    desc: "Every 7 days: what moved, what's stuck, a replanned next sprint, and an explicit win celebration.",
  },
  {
    href: "/dashboard",
    title: "5. Progress Dashboard",
    desc: "See your streaks, stats, badges, and a Memory Lane of every day you've shown up.",
  },
];

export default function Home() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="mt-1 text-ink/70">
          Your daily rhythm: onboard once, activate a goal, run the daily
          loop, and let weekly review keep the plan honest.
        </p>
        <p className="mt-2 text-sm text-ink/60">
          Try Onboarding free as a guest — sign in with Google or LinkedIn any
          time to save permanently and unlock activation, the Daily Loop,
          Weekly Review, and your Dashboard.
        </p>
      </div>

      <div className="grid gap-4">
        {steps.map((step) => (
          <Link
            key={step.href}
            href={step.href}
            className="card block p-5 transition-shadow hover:shadow-md"
          >
            <h2 className="font-medium">{step.title}</h2>
            <p className="mt-1 text-sm text-ink/70">{step.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
