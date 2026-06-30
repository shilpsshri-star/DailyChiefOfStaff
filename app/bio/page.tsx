import Link from "next/link";

// Public showcase page — no sign-in required, not linked from the nav.
// Placeholder copy: edit the strings below (name, tagline, links, email)
// to match your own background. The case-study content describes this app
// itself, since it's the most concrete proof of these skills.

const skills = [
  "Agentic product design (multi-step AI workflows, not single-prompt features)",
  "Prompt + guardrail design (drafter/critic patterns, fallback behavior)",
  "MCP (Model Context Protocol): building servers and clients, not just consuming them",
  "Full-stack delivery: Next.js, Postgres/Supabase, auth, deployment",
  "Shipping fast with AI pair-programming, then verifying like an engineer would",
];

const caseStudyPoints = [
  {
    title: "The product",
    body:
      "Daily Chief of Staff turns a handful of free-text goals into a concrete, daily-driven execution plan: AI breaks each goal into milestones, milestones into 5-7 concrete steps (each with a resource, a deliverable, and a time estimate), then runs a daily focus/check-in loop and a weekly review — all backed by real persistence and real auth, not a demo shell.",
  },
  {
    title: "Drafter + critic agent pipeline",
    body:
      "Step generation isn't a single prompt. A drafter model proposes steps, then an independent critic pass reviews them against house rules (concreteness, real resources, no duplicate dependencies) before anything reaches the user — with the original draft's dependency graph always preserved so a critic mistake can never corrupt step ordering, and a silent fallback to the draft if the critic call fails for any reason.",
  },
  {
    title: "MCP server + MCP client, in the same app",
    body:
      "Built a standalone MCP server exposing this app's own goals/milestones/steps as tools, so Claude Desktop can answer “what's my focus today” directly. One of those tools then acts as an MCP client itself, calling out to Google's hosted Calendar MCP server to create a calendar event when a milestone gets a target date — a small, real example of agent-to-agent tool composition, scoped deliberately as a lightweight demo rather than a full OAuth integration.",
  },
  {
    title: "Built for editing, not just generation",
    body:
      "Every AI-proposed milestone and step can be edited or deleted before it's confirmed, and the data model treats AI output as a draft state (\"proposed\") distinct from the user's confirmed plan — including catching and fixing an edge case where a reload after generating-but-not-confirming milestones briefly left the page with nothing to show.",
  },
];

export default function BioPage() {
  return (
    <div className="space-y-10">
      <div className="card p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">AI Product Manager</p>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Shilpa</h1>
            <p className="mt-3 max-w-xl text-ink/70">
              I design and ship agentic AI products end to end — from the
              prompt and guardrail design down to the auth, the database, and
              the deploy. This page exists because the best way to show that
              is to point at something real and working.
            </p>
          </div>
          <div className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent text-2xl font-semibold text-white sm:flex">
            S
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <a
            href="https://www.stostr.com"
            className="btn-primary px-4 py-2"
          >
            Try the live app
          </a>
          <a
            href="mailto:shilps.shri@gmail.com"
            className="rounded-md border border-[#e8e6e1] px-4 py-2 font-medium text-ink/80 hover:bg-[#f1efe9]"
          >
            shilps.shri@gmail.com
          </a>
          {/* Add your LinkedIn / GitHub / resume links here as the same style of <a> tag */}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">
          Case study: Daily Chief of Staff
        </h2>
        <p className="mt-1 text-sm text-ink/60">
          The product on this domain is also the portfolio piece — built and
          shipped solo, with an AI pair-programmer, to a real production
          deploy with real users.
        </p>

        <div className="mt-4 grid gap-4">
          {caseStudyPoints.map((point) => (
            <div key={point.title} className="card p-5">
              <h3 className="font-medium">{point.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
                {point.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Skills demonstrated here</h2>
        <ul className="mt-3 space-y-2">
          {skills.map((skill) => (
            <li
              key={skill}
              className="card flex items-start gap-2 px-4 py-3 text-sm text-ink/80"
            >
              <span className="mt-0.5 text-accent">•</span>
              <span>{skill}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-sm text-ink/70">
          Want to see the daily loop, the weekly review, or the dashboard in
          action?
        </p>
        <Link href="/" className="btn-primary px-4 py-2 text-sm">
          Explore the app
        </Link>
      </div>
    </div>
  );
}
