import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet, KEYS } from "@/lib/kv";
import { requireUserId, unauthorized } from "@/lib/auth";
import { askClaude } from "@/lib/anthropic";
import { buildProfileContext } from "@/lib/context";
import { todayKey } from "@/lib/date";
import { recordActivity } from "@/lib/stats";
import { Briefing, BriefingPriority, EMPTY_PROFILE, Profile } from "@/lib/types";

const SYSTEM_PROMPT = `You are a sharp, warm, no-nonsense Chief of Staff for one person.
You always know their 5 goals and their current task list (provided below as context).
Your job in this step: pick the TOP 3 priorities for today out of their open tasks
(or goal-aligned actions if their task list is thin), and explain briefly why each
one matters right now, tying it back to their goals where relevant.

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{"priorities":[{"task":"...","reasoning":"..."},{"task":"...","reasoning":"..."},{"task":"...","reasoning":"..."}]}`;

function parsePriorities(raw: string): BriefingPriority[] {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const json = match ? JSON.parse(match[0]) : JSON.parse(raw);
    if (Array.isArray(json.priorities)) {
      return json.priorities
        .filter((p: unknown) => typeof p === "object" && p !== null)
        .map((p: Partial<BriefingPriority>) => ({
          task: typeof p.task === "string" ? p.task : "",
          reasoning: typeof p.reasoning === "string" ? p.reasoning : "",
        }))
        .filter((p: BriefingPriority) => p.task.trim().length > 0)
        .slice(0, 3);
    }
  } catch {
    // fall through
  }
  return [];
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const date = todayKey();
  const briefing = await kvGet<Briefing>(KEYS.briefing(userId, date));
  return NextResponse.json(briefing);
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const date = todayKey();
  const profile =
    (await kvGet<Profile>(KEYS.profile(userId))) ?? EMPTY_PROFILE;

  const context = buildProfileContext(profile);
  const userMessage = `Today is ${date}.\n\n${context}\n\nWhat are my top 3 priorities today?`;

  let raw: string;
  try {
    raw = await askClaude({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 800,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const priorities = parsePriorities(raw);

  const briefing: Briefing = {
    date,
    priorities,
    raw,
    generatedAt: new Date().toISOString(),
  };

  await kvSet(KEYS.briefing(userId, date), briefing);
  await recordActivity(userId, date);

  return NextResponse.json(briefing);
}
