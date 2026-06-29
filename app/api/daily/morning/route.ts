import { NextRequest, NextResponse } from "next/server";
import { loadProfile, saveProfile, loadDailyLog, saveDailyLog } from "@/lib/db";
import { requireUserId, unauthorized } from "@/lib/auth";
import { FocusCandidate, pickDailyFocus } from "@/lib/planner";
import { getCandidateSteps } from "@/lib/goals";
import { dateMinusDays, todayKey } from "@/lib/date";
import { recordActivity } from "@/lib/stats";
import { DailyLog, EMPTY_DAILY_LOG } from "@/lib/types";

function recapFromYesterday(log: DailyLog | null): string {
  if (!log || log.results.length === 0) return "";
  const lines = log.results.map((r) => {
    const item = log.focusItems.find((f) => f.stepId === r.stepId);
    const label = item ? item.stepText : r.stepId;
    return `- ${label}: ${r.status}${r.note ? ` (${r.note})` : ""}`;
  });
  return `Yesterday's results:\n${lines.join("\n")}${
    log.adjustmentNote ? `\n\nYesterday's chief-of-staff note: ${log.adjustmentNote}` : ""
  }`;
}

// Guests never call this GET -- they read today's log straight out of
// localStorage (lib/guestStore.ts) since there's nothing server-side to load.
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const date = todayKey();
  const log = await loadDailyLog(userId, date);
  return NextResponse.json(log ?? EMPTY_DAILY_LOG(date));
}

// Signed-in callers: unchanged -- loads the profile from Supabase, picks
// focus, persists the updated profile + daily log.
//
// Guests have no server-side profile, so they instead send the exact
// candidate list (computed client-side via getCandidateSteps() against
// their localStorage Profile) plus a recap string, and get back the bare
// AI picks with no persistence. The client then builds the DailyFocusItem
// list and marks steps "active" in its own local Profile.
export async function POST(req: NextRequest) {
  const userId = await requireUserId();

  if (!userId) {
    const body = await req.json().catch(() => ({}));
    const candidates: FocusCandidate[] = Array.isArray(body.candidates)
      ? body.candidates
      : [];
    const recap = typeof body.recap === "string" ? body.recap : "";

    if (candidates.length === 0) {
      return NextResponse.json({ picks: [] });
    }

    try {
      const picks = await pickDailyFocus(candidates, recap);
      return NextResponse.json({ picks });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const date = todayKey();
  const existing = await loadDailyLog(userId, date);
  if (existing && existing.morningGeneratedAt) {
    return NextResponse.json(existing);
  }

  const profile = await loadProfile(userId);
  const candidates = getCandidateSteps(profile);

  if (candidates.length === 0) {
    const log: DailyLog = {
      ...EMPTY_DAILY_LOG(date),
      morningGeneratedAt: new Date().toISOString(),
    };
    await saveDailyLog(userId, log);
    return NextResponse.json(log);
  }

  const yesterday = await loadDailyLog(userId, dateMinusDays(date, 1));

  let picks;
  try {
    picks = await pickDailyFocus(candidates, recapFromYesterday(yesterday));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Mark picked steps "active" in the profile so they don't show up as
  // candidates again until resolved.
  for (const pick of picks) {
    for (const goal of profile.goals) {
      const candidate = candidates.find((c) => c.stepId === pick.stepId);
      if (!candidate) continue;
      if (goal.text !== candidate.goalText) continue;
      for (const milestone of goal.milestones) {
        const step = milestone.steps.find((s) => s.id === pick.stepId);
        if (step) step.status = "active";
      }
    }
  }
  await saveProfile(userId, profile);

  const focusItems = picks
    .map((p) => {
      const c = candidates.find((c) => c.stepId === p.stepId);
      if (!c) return null;
      // find ids for goal/milestone for memory-lane linking
      let goalId = "";
      let milestoneId = "";
      for (const goal of profile.goals) {
        if (goal.text !== c.goalText) continue;
        for (const milestone of goal.milestones) {
          if (milestone.steps.some((s) => s.id === p.stepId)) {
            goalId = goal.id;
            milestoneId = milestone.id;
          }
        }
      }
      return {
        stepId: p.stepId,
        goalId,
        milestoneId,
        goalText: c.goalText,
        milestoneText: c.milestoneText,
        stepText: c.stepText,
        reasoning: p.reasoning,
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  const log: DailyLog = {
    date,
    focusItems,
    results: [],
    adjustmentNote: "",
    morningGeneratedAt: new Date().toISOString(),
    eveningCompletedAt: null,
  };

  await saveDailyLog(userId, log);
  await recordActivity(userId, date);

  return NextResponse.json(log);
}
