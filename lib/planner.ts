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
  output: string;
  estimatedDays: number;
  dependsOnIndexes: number[]; // indexes into the same proposed-steps array, 0-based
}

const STEPS_SYSTEM = `You are a sharp, practical Chief of Staff helping someone break a milestone down into concrete steps.
Given a goal and one milestone of that goal, propose 5 to 7 concrete steps that complete the milestone.
For each step give: a clear action ("text"), a clear definition of done ("output" — what exists or is true once it's finished),
an estimated number of days to complete it ("estimatedDays", a positive integer), and any dependencies on other steps in
this same list by their 0-based index ("dependsOnIndexes", an array of integers, empty if none — only depend on earlier steps).
Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{"steps":[{"text":"...","output":"...","estimatedDays":2,"dependsOnIndexes":[]}]}`;

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
    maxTokens: 1200,
  });

  try {
    const json = extractJson(raw) as { steps?: unknown };
    if (Array.isArray(json.steps)) {
      return json.steps
        .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
        .map((s) => ({
          text: typeof s.text === "string" ? s.text.trim() : "",
          output: typeof s.output === "string" ? s.output.trim() : "",
          estimatedDays:
            typeof s.estimatedDays === "number" && s.estimatedDays > 0
              ? Math.round(s.estimatedDays)
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
top focus items, and explain briefly why each matters right now. You MUST only choose stepId values from the provided list.
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
