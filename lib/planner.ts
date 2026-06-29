// AI planning helpers for the goal -> milestones -> steps -> daily loop ->
// weekly review workflow. Every function returns parsed, validated data —
// never raw model output — so the rest of the app can trust the shape.

import { askClaude } from "./anthropic";

function extractJson(raw: string): unknown {
  const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  const candidate = match ? match[0] : raw;
  return JSON.parse(candidate);
}

// ---------- Goal -> Milestones ----------

export interface ProposedMilestone {
  text: string;
}

const MILESTONES_SYSTEM = `You are a sharp, practical Chief of Staff helping someone break a goal down into milestones.
Given one goal, propose 3 to 5 milestones that, completed in order, would achieve the goal.
Each milestone should be a meaningful, concrete checkpoint — not vague ("get better at X") and not a tiny task.
Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{"milestones":[{"text":"..."},{"text":"..."}]}`;

export async function breakdownGoalIntoMilestones(
  goalText: string
): Promise<ProposedMilestone[]> {
  const raw = await askClaude({
    system: MILESTONES_SYSTEM,
    messages: [
      {
        role: "user",
        content: `My goal: "${goalText}"\n\nBreak this into 3-5 milestones.`,
      },
    ],
    maxTokens: 800,
  });

  try {
    const json = extractJson(raw) as { milestones?: unknown };
    if (Array.isArray(json.milestones)) {
      return json.milestones
        .filter((m): m is { text?: unknown } => typeof m === "object" && m !== null)
        .map((m) => ({ text: typeof m.text === "string" ? m.text.trim() : "" }))
        .filter((m) => m.text.length > 0)
        .slice(0, 5);
    }
  } catch {
    // fall through
  }
  return [];
}

// ---------- Milestone -> Steps ----------

export interface ProposedStep {
  text: string;
  resource: string;
  output: string;
  estimatedHours: number;
  dependsOnIndexes: number[]; // indexes into the same proposed-steps array, 0-based
}

const STEPS_SYSTEM = `You are a sharp, practical Chief of Staff helping someone break a milestone down into concrete steps.
Given a goal and one milestone of that goal, propose 5 to 7 concrete steps that complete the milestone.

Every step must be immediately actionable with no further interpretation needed. For each step give:

1. "text" — a concrete action, never vague advice. Name the specific thing to do. Bad: "Assess your current skill level." Good: "Take the free skills assessment at linkedin.com/learning/paths and screenshot your results." If you don't know a real URL, name a specific, real, well-known tool, book, course, or template by name instead of inventing a fake link.
2. "resource" — a piece of READ-ONLY reference material for this step: an article, a course, a tutorial, a specific book/video, or a real person to contact. The resource is something to consult, not a destination for doing or tracking the work. NEVER suggest the user go set up tracking, planning, or note-taking in a separate app — no "create a Notion board," no "make a spreadsheet to track this," no "set up a Trello/Asana board." This app already has a notes field on every step for exactly that purpose (jotting findings, links, progress) — assume the user will use it instead of standing up another tool. Empty string if a step genuinely needs no external resource (e.g. "Write a one-page summary of what you learned").
3. "output" — the deliverable: what concretely exists or is true once this step is done (a file, a number, a decision, a completed form, or — when the step is research/thinking — a few lines written in this step's own notes field). Never describe the output as "a tracker," "a board," or "a doc in another app."
4. "estimatedHours" — estimated time to complete, in HOURS (not days). Use realistic fractional or whole numbers (e.g. 0.5, 1, 2, 4, 8).
5. "dependsOnIndexes" — an array of 0-based indexes into this same list for any steps that must finish first (empty if none — only depend on earlier steps).

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{"steps":[{"text":"...","resource":"...","output":"...","estimatedHours":2,"dependsOnIndexes":[]}]}`;

export async function breakdownMilestoneIntoSteps(
  goalText: string,
  milestoneText: string
): Promise<ProposedStep[]> {
  const raw = await askClaude({
    system: STEPS_SYSTEM,
    messages: [
      {
        role: "user",
        content: `My goal: "${goalText}"\nThe milestone to break down: "${milestoneText}"\n\nBreak this milestone into 5-7 concrete steps.`,
      },
    ],
    maxTokens: 1600,
  });

  try {
    const json = extractJson(raw) as { steps?: unknown };
    if (Array.isArray(json.steps)) {
      return json.steps
        .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
        .map((s) => ({
          text: typeof s.text === "string" ? s.text.trim() : "",
          resource: typeof s.resource === "string" ? s.resource.trim() : "",
          output: typeof s.output === "string" ? s.output.trim() : "",
          estimatedHours:
            typeof s.estimatedHours === "number" && s.estimatedHours > 0
              ? Math.round(s.estimatedHours * 4) / 4 // round to nearest quarter-hour
              : 1,
          dependsOnIndexes: Array.isArray(s.dependsOnIndexes)
            ? s.dependsOnIndexes.filter((n: unknown) => typeof n === "number")
            : [],
        }))
        .filter((s) => s.text.length > 0)
        .slice(0, 7);
    }
  } catch {
    // fall through
  }
  return [];
}

// ---------- Daily focus picking ----------

export interface FocusCandidate {
  stepId: string;
  goalText: string;
  milestoneText: string;
  stepText: string;
  output: string;
}

export interface PickedFocus {
  stepId: string;
  reasoning: string;
}

const FOCUS_SYSTEM = `You are the user's Chief of Staff doing their morning planning.
You'll be given a list of candidate steps (each tied to a goal and milestone) that are unblocked and ready to work on,
plus a short recap of recent days. Pick exactly 3 of these candidates (fewer only if fewer than 3 exist) as today's
top focus items, and explain briefly why each matters right now. Prefer spreading picks across different goals and
milestones rather than piling all 3 onto the same one, unless the recap makes a strong case for focusing narrowly.
You MUST only choose stepId values from the provided list.
Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{"picks":[{"stepId":"...","reasoning":"..."}]}`;

export async function pickDailyFocus(
  candidates: FocusCandidate[],
  recentRecap: string
): Promise<PickedFocus[]> {
  if (candidates.length === 0) return [];

  const candidateList = candidates
    .map(
      (c, i) =>
        `${i + 1}. stepId="${c.stepId}" | goal="${c.goalText}" | milestone="${c.milestoneText}" | step="${c.stepText}" | done looks like="${c.output}"`
    )
    .join("\n");

  const raw = await askClaude({
    system: FOCUS_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Candidate steps:\n${candidateList}\n\nRecent recap:\n${recentRecap || "(no recent history yet)"}\n\nPick today's top 3 focus items.`,
      },
    ],
    maxTokens: 800,
  });

  const validIds = new Set(candidates.map((c) => c.stepId));

  try {
    const json = extractJson(raw) as { picks?: unknown };
    if (Array.isArray(json.picks)) {
      return json.picks
        .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
        .map((p) => ({
          stepId: typeof p.stepId === "string" ? p.stepId : "",
          reasoning: typeof p.reasoning === "string" ? p.reasoning : "",
        }))
        .filter((p) => validIds.has(p.stepId))
        .slice(0, 3);
    }
  } catch {
    // fall through
  }

  // Fallback: if the model misbehaves, just take the first 3 candidates so
  // the morning loop never silently breaks.
  return candidates.slice(0, 3).map((c) => ({
    stepId: c.stepId,
    reasoning: "Picked automatically — next unblocked step toward this goal.",
  }));
}

// ---------- Evening adjustment ----------

const ADJUST_SYSTEM = `You are the user's Chief of Staff reacting to their end-of-day check-in.
You'll be given today's focus items and what actually happened to each (done / blocked / skipped, with a one-line reason).
Write a short (2-4 sentence) honest, encouraging reaction: acknowledge what got done, address anything blocked or skipped
with a concrete suggestion, and note any implication for tomorrow's plan. Plain text only, no markdown headers.`;

export async function adjustPlanFromDailyResults(recap: string): Promise<string> {
  return askClaude({
    system: ADJUST_SYSTEM,
    messages: [{ role: "user", content: recap }],
    maxTokens: 400,
  });
}

// ---------- Weekly review ----------

export interface WeeklyReplan {
  moved: string[];
  stuck: string[];
  replan: string;
  celebration: string;
}

const WEEKLY_SYSTEM = `You are the user's Chief of Staff running their weekly review.
You'll be given a recap of the last 7 days: goals, milestones, steps, and daily results.
Identify what moved (progressed) and what's stuck (and briefly why), write a short replanned next sprint
(what to focus on in the coming week, prose, 3-5 sentences), and an explicit, genuine win celebration
(prose, 1-3 sentences, calling out something specific they should feel good about).
Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{"moved":["..."],"stuck":["..."],"replan":"...","celebration":"..."}`;

export async function weeklyReplan(recap: string): Promise<WeeklyReplan> {
  const raw = await askClaude({
    system: WEEKLY_SYSTEM,
    messages: [{ role: "user", content: recap }],
    maxTokens: 1000,
  });

  try {
    const json = extractJson(raw) as Record<string, unknown>;
    return {
      moved: Array.isArray(json.moved)
        ? json.moved.filter((m): m is string => typeof m === "string")
        : [],
      stuck: Array.isArray(json.stuck)
        ? json.stuck.filter((m): m is string => typeof m === "string")
        : [],
      replan: typeof json.replan === "string" ? json.replan : "",
      celebration: typeof json.celebration === "string" ? json.celebration : "",
    };
  } catch {
    return { moved: [], stuck: [], replan: raw, celebration: "" };
  }
}
