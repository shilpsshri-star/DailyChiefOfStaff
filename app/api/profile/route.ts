import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvSet, KEYS } from "@/lib/kv";
import { requireUserId, unauthorized } from "@/lib/auth";
import { recordActivity } from "@/lib/stats";
import { todayKey } from "@/lib/date";
import { EMPTY_PROFILE, Goal, Profile, Task } from "@/lib/types";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const profile = await kvGet<Profile>(KEYS.profile(userId));
  return NextResponse.json(profile ?? EMPTY_PROFILE);
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const body = await req.json();

  const rawGoals = Array.isArray(body.goals) ? body.goals : [];
  const goals: Goal[] = [...rawGoals, ...EMPTY_PROFILE.goals]
    .slice(0, 5)
    .map((g: Partial<Goal> | string) => {
      if (typeof g === "string") return { text: g, achieved: false };
      return {
        text: typeof g.text === "string" ? g.text : "",
        achieved: Boolean(g.achieved),
      };
    });

  const tasks: Task[] = Array.isArray(body.tasks)
    ? body.tasks
        .filter((t: unknown) => typeof t === "object" && t !== null)
        .map((t: Partial<Task>, i: number) => ({
          id: t.id ?? `task-${Date.now()}-${i}`,
          text: typeof t.text === "string" ? t.text : "",
          done: Boolean(t.done),
        }))
        .filter((t: Task) => t.text.trim().length > 0)
    : [];

  const profile: Profile = {
    goals,
    tasks,
    updatedAt: new Date().toISOString(),
  };

  await kvSet(KEYS.profile(userId), profile);

  const totalGoalsAchieved = goals.filter((g) => g.achieved).length;
  await recordActivity(userId, todayKey(), { totalGoalsAchieved });

  return NextResponse.json(profile);
}
