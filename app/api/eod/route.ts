import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet, KEYS } from "@/lib/kv";
import { requireUserId, unauthorized } from "@/lib/auth";
import { askClaude } from "@/lib/anthropic";
import { buildProfileContext } from "@/lib/context";
import { todayKey } from "@/lib/date";
import { recordActivity } from "@/lib/stats";
import { EMPTY_PROFILE, EndOfDaySummary, Profile } from "@/lib/types";

const SYSTEM_PROMPT = `You are the user's Chief of Staff doing their end-of-day check-in.
You know their 5 goals and their full task list, including what they just marked
done today (provided below). Write a short, encouraging but honest summary (3-5
sentences): what they accomplished, how it connects to their goals, and one
clear, specific nudge for tomorrow. Plain text only, no markdown headers.`;

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const date = todayKey();
  const profile = (await kvGet<Profile>(KEYS.profile(userId))) ?? EMPTY_PROFILE;
  const eod = await kvGet<EndOfDaySummary>(KEYS.eod(userId, date));
  return NextResponse.json({ profile, eod });
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const date = todayKey();
  const body = await req.json();
  const completedTaskIds: string[] = Array.isArray(body.completedTaskIds)
    ? body.completedTaskIds
    : [];

  const profile = (await kvGet<Profile>(KEYS.profile(userId))) ?? EMPTY_PROFILE;

  const updatedProfile: Profile = {
    ...profile,
    tasks: profile.tasks.map((t) => ({
      ...t,
      done: completedTaskIds.includes(t.id) ? true : t.done,
    })),
    updatedAt: new Date().toISOString(),
  };
  await kvSet(KEYS.profile(userId), updatedProfile);

  const justCompleted = updatedProfile.tasks.filter((t) =>
    completedTaskIds.includes(t.id)
  );
  const context = buildProfileContext(updatedProfile);
  const userMessage = `Today is ${date}.\n\n${context}\n\nToday I marked these as done:\n${
    justCompleted.length
      ? justCompleted.map((t) => `- ${t.text}`).join("\n")
      : "(nothing marked done today)"
  }\n\nGive me my end-of-day summary.`;

  let summary: string;
  try {
    summary = await askClaude({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 600,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const eod: EndOfDaySummary = {
    date,
    completedTaskIds,
    summary,
    generatedAt: new Date().toISOString(),
  };
  await kvSet(KEYS.eod(userId, date), eod);

  const totalGoalsAchieved = updatedProfile.goals.filter((g) => g.achieved).length;
  await recordActivity(userId, date, {
    tasksCompletedToday: completedTaskIds.length,
    totalGoalsAchieved,
  });

  return NextResponse.json({ profile: updatedProfile, eod });
}
