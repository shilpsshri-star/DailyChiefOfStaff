import Link from "next/link";

const steps = [
  {
    href: "/onboarding",
    title: "1. Onboarding",
    desc: "Set your 5 goals and your task list. Do this once, update anytime.",
  },
  {
    href: "/briefing",
    title: "2. Morning Briefing",
    desc: "Your AI chief of staff reads your goals and tasks, then tells you your top 3 priorities for today, with reasoning.",
  },
  {
    href: "/chat",
    title: "3. Chat",
    desc: "Talk to your chief of staff any time — it always has your goals and tasks as context.",
  },
  {
    href: "/end-of-day",
    title: "4. End of Day",
    desc: "Check off what you got done. Your chief of staff gives you a short summary and a nudge for tomorrow.",
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
          Your daily rhythm: onboard once, get a morning briefing, chat as needed, close the loop at night.
        </p>
        <p className="mt-2 text-sm text-ink/60">
          Try Onboarding free as a guest — sign in with Google or LinkedIn any
          time to save permanently and unlock Briefing, Chat, End of Day, and
          your Dashboard.
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
