// Repository layer over Supabase Postgres. This is the only place that
// knows how the Goal -> Milestone -> Step tree (the in-memory `Profile`
// shape every other module already works with) maps onto the relational
// `goals` / `milestones` / `steps` tables, plus `daily_logs`,
// `weekly_reviews`, and the per-user `users` row (email, onboarding state,
// last weekly review date, and a denormalized `stats` JSON blob).
//
// Every save here is a wholesale replace of the affected rows for that
// user/day -- mirroring the previous Vercel KV behavior where the entire
// Profile (or the entire day's DailyLog) was overwritten on every write.
// That keeps every API route's existing read-mutate-write logic unchanged;
// only the storage calls themselves were swapped out.
//
// Every Supabase error is console.error'd with a "[db:<op>]" tag *before*
// being re-thrown, so a failed insert/select shows up clearly in Vercel's
// function logs (Project -> Logs / Observability) instead of just bubbling
// up as a bare 500 with no detail.

import { getSupabaseAdmin } from "./supabase";
import {
  DailyFocusItem,
  DailyLog,
  DailyResult,
  DailyResultStatus,
  EMPTY_PROFILE,
  Goal,
  Milestone,
  Profile,
  Step,
  WeeklyReview,
} from "./types";

function logErr(op: string, error: unknown): void {
  console.error(`[db:${op}]`, error);
}

export async function ensureUser(
  userId: string,
  email?: string | null
): Promise<void> {
  const sb = getSupabaseAdmin();
  const row: Record<string, unknown> = { id: userId };
  if (email) row.email = email;
  const { error } = await sb.from("users").upsert(row, { onConflict: "id" });
  if (error) {
    logErr("ensureUser", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Profile (goals -> milestones -> steps)
// ---------------------------------------------------------------------------

export async function loadProfile(userId: string): Promise<Profile> {
  const sb = getSupabaseAdmin();

  const { data: goalRows, error: goalsErr } = await sb
    .from("goals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (goalsErr) {
    logErr("loadProfile:goals", goalsErr);
    throw goalsErr;
  }
  if (!goalRows || goalRows.length === 0) return { ...EMPTY_PROFILE };

  const goalIds = goalRows.map((g) => g.id as string);

  const { data: milestoneRows, error: msErr } = await sb
    .from("milestones")
    .select("*")
    .in("goal_id", goalIds)
    .order("order", { ascending: true });
  if (msErr) {
    logErr("loadProfile:milestones", msErr);
    throw msErr;
  }

  const milestoneIds = (milestoneRows ?? []).map((m) => m.id as string);

  let stepRows: Record<string, unknown>[] = [];
  if (milestoneIds.length > 0) {
    const { data, error: stErr } = await sb
      .from("steps")
      .select("*")
      .in("milestone_id", milestoneIds)
      .order("order", { ascending: true });
    if (stErr) {
      logErr("loadProfile:steps", stErr);
      throw stErr;
    }
    stepRows = data ?? [];
  }

  const stepsByMilestone = new Map<string, Step[]>();
  for (const row of stepRows) {
    const step: Step = {
      id: row.id as string,
      text: (row.title as string) ?? "",
      resource: (row.resource as string) ?? "",
      output: (row.output as string) ?? "",
      estimatedHours: (row.estimated_hours as number) ?? 1,
      dependencies: (row.dependencies as string[]) ?? [],
      status: row.status as Step["status"],
      order: (row.order as number) ?? 0,
      notes: (row.notes as string) ?? "",
    };
    const milestoneId = row.milestone_id as string;
    const list = stepsByMilestone.get(milestoneId) ?? [];
    list.push(step);
    stepsByMilestone.set(milestoneId, list);
  }

  const milestonesByGoal = new Map<string, Milestone[]>();
  for (const row of milestoneRows ?? []) {
    const milestone: Milestone = {
      id: row.id as string,
      text: (row.title as string) ?? "",
      order: (row.order as number) ?? 0,
      status: row.status as Milestone["status"],
      steps: stepsByMilestone.get(row.id as string) ?? [],
    };
    const goalId = row.goal_id as string;
    const list = milestonesByGoal.get(goalId) ?? [];
    list.push(milestone);
    milestonesByGoal.set(goalId, list);
  }

  const goals: Goal[] = goalRows.map((row) => ({
    id: row.id as string,
    text: (row.title as string) ?? "",
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    status: row.status as Goal["status"],
    milestones: milestonesByGoal.get(row.id as string) ?? [],
  }));

  return { goals, updatedAt: new Date().toISOString() };
}

// Quotes + comma-joins ids for a PostgREST "in" filter list, e.g.
// ("a","b","c"). Used to prune rows no longer present in a save.
function pgInList(ids: string[]): string {
  return `(${ids.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",")})`;
}

async function pruneMissing(
  table: "goals" | "milestones" | "steps",
  userId: string,
  keepIds: string[]
): Promise<void> {
  const sb = getSupabaseAdmin();
  let query = sb.from(table).delete().eq("user_id", userId);
  if (keepIds.length > 0) {
    query = query.not("id", "in", pgInList(keepIds));
  }
  const { error } = await query;
  if (error) {
    logErr(`pruneMissing:${table}`, error);
    throw error;
  }
}

export async function saveProfile(
  userId: string,
  profile: Profile
): Promise<void> {
  await ensureUser(userId);
  const sb = getSupabaseAdmin();

  const goalRows = profile.goals.map((g) => ({
    id: g.id,
    user_id: userId,
    title: g.text,
    status: g.status,
    created_at: g.createdAt,
  }));

  const milestoneRows: Record<string, unknown>[] = [];
  const stepRows: Record<string, unknown>[] = [];

  for (const g of profile.goals) {
    for (const m of g.milestones) {
      milestoneRows.push({
        id: m.id,
        goal_id: g.id,
        user_id: userId,
        title: m.text,
        order: m.order,
        status: m.status,
      });
      for (const s of m.steps) {
        stepRows.push({
          id: s.id,
          milestone_id: m.id,
          goal_id: g.id,
          user_id: userId,
          title: s.text,
          resource: s.resource,
          output: s.output,
          estimated_hours: s.estimatedHours,
          dependencies: s.dependencies,
          status: s.status,
          order: s.order,
          notes: s.notes ?? "",
        });
      }
    }
  }

  if (goalRows.length > 0) {
    const { error } = await sb.from("goals").upsert(goalRows, { onConflict: "id" });
    if (error) {
      logErr("saveProfile:goals", error);
      throw error;
    }
  }
  if (milestoneRows.length > 0) {
    const { error } = await sb
      .from("milestones")
      .upsert(milestoneRows, { onConflict: "id" });
    if (error) {
      logErr("saveProfile:milestones", error);
      throw error;
    }
  }
  if (stepRows.length > 0) {
    const { error } = await sb.from("steps").upsert(stepRows, { onConflict: "id" });
    if (error) {
      logErr("saveProfile:steps", error);
      throw error;
    }
  }

  // Prune children-first so the FK cascade never fights the delete order.
  await pruneMissing("steps", userId, stepRows.map((r) => r.id as string));
  await pruneMissing(
    "milestones",
    userId,
    milestoneRows.map((r) => r.id as string)
  );
  await pruneMissing("goals", userId, goalRows.map((r) => r.id as string));
}

// ---------------------------------------------------------------------------
// User meta (onboarding state, last weekly review date)
// ---------------------------------------------------------------------------

export interface UserMetaRow {
  onboardedAt: string | null;
  lastWeeklyReviewDate: string | null;
}

export async function getUserMeta(userId: string): Promise<UserMetaRow> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .select("onboarded_at, last_weekly_review_date")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    logErr("getUserMeta", error);
    throw error;
  }
  return {
    onboardedAt: (data?.onboarded_at as string | null) ?? null,
    lastWeeklyReviewDate:
      (data?.last_weekly_review_date as string | null) ?? null,
  };
}

export async function markOnboardedIfNeeded(userId: string): Promise<void> {
  await ensureUser(userId);
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("users")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", userId)
    .is("onboarded_at", null);
  if (error) {
    logErr("markOnboardedIfNeeded", error);
    throw error;
  }
}

export async function setLastWeeklyReviewDate(
  userId: string,
  date: string
): Promise<void> {
  await ensureUser(userId);
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("users")
    .update({ last_weekly_review_date: date })
    .eq("id", userId);
  if (error) {
    logErr("setLastWeeklyReviewDate", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Daily logs
// ---------------------------------------------------------------------------

export async function loadDailyLog(
  userId: string,
  date: string
): Promise<DailyLog | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("daily_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date);
  if (error) {
    logErr("loadDailyLog", error);
    throw error;
  }
  if (!data || data.length === 0) return null;

  const focusRows = data.filter((row) => row.step_id !== null);

  const focusItems: DailyFocusItem[] = focusRows.map((row) => ({
    stepId: row.step_id as string,
    goalId: (row.goal_id as string) ?? "",
    milestoneId: (row.milestone_id as string) ?? "",
    goalText: (row.goal_text as string) ?? "",
    milestoneText: (row.milestone_text as string) ?? "",
    stepText: (row.step_text as string) ?? "",
    reasoning: (row.reasoning as string) ?? "",
  }));

  const results: DailyResult[] = focusRows
    .filter((row) => row.status !== null)
    .map((row) => ({
      stepId: row.step_id as string,
      status: row.status as DailyResultStatus,
      note: (row.reason as string) ?? "",
    }));

  const first = data[0];
  return {
    date,
    focusItems,
    results,
    adjustmentNote: (first.adjustment_note as string) ?? "",
    morningGeneratedAt: (first.morning_generated_at as string) ?? null,
    eveningCompletedAt: (first.evening_completed_at as string) ?? null,
  };
}

interface DailyLogRow {
  user_id: string;
  step_id: string | null;
  goal_id: string | null;
  milestone_id: string | null;
  goal_text: string | null;
  milestone_text: string | null;
  step_text: string | null;
  reasoning: string | null;
  date: string;
  status: DailyResultStatus | null;
  reason: string;
  morning_generated_at: string | null;
  evening_completed_at: string | null;
  adjustment_note: string;
}

export async function saveDailyLog(
  userId: string,
  log: DailyLog
): Promise<void> {
  await ensureUser(userId);
  const sb = getSupabaseAdmin();

  // Wholesale replace, same as the old kvSet(KEYS.dailyLog(...)) behavior.
  const { error: delErr } = await sb
    .from("daily_logs")
    .delete()
    .eq("user_id", userId)
    .eq("date", log.date);
  if (delErr) {
    logErr("saveDailyLog:delete", delErr);
    throw delErr;
  }

  const resultByStep = new Map(log.results.map((r) => [r.stepId, r]));

  const rows: DailyLogRow[] =
    log.focusItems.length > 0
      ? log.focusItems.map((item) => {
          const result = resultByStep.get(item.stepId);
          return {
            user_id: userId,
            step_id: item.stepId,
            goal_id: item.goalId || null,
            milestone_id: item.milestoneId || null,
            goal_text: item.goalText,
            milestone_text: item.milestoneText,
            step_text: item.stepText,
            reasoning: item.reasoning,
            date: log.date,
            status: result?.status ?? null,
            reason: result?.note ?? "",
            morning_generated_at: log.morningGeneratedAt,
            evening_completed_at: log.eveningCompletedAt,
            adjustment_note: log.adjustmentNote,
          };
        })
      : [
          {
            user_id: userId,
            step_id: null,
            goal_id: null,
            milestone_id: null,
            goal_text: null,
            milestone_text: null,
            step_text: null,
            reasoning: null,
            date: log.date,
            status: null,
            reason: "",
            morning_generated_at: log.morningGeneratedAt,
            evening_completed_at: log.eveningCompletedAt,
            adjustment_note: log.adjustmentNote,
          },
        ];

  const { error: insErr } = await sb.from("daily_logs").insert(rows);
  if (insErr) {
    logErr("saveDailyLog:insert", insErr);
    throw insErr;
  }
}

// ---------------------------------------------------------------------------
// Weekly reviews
// ---------------------------------------------------------------------------

export async function loadWeeklyReview(
  userId: string,
  weekEnd: string
): Promise<WeeklyReview | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("weekly_reviews")
    .select("*")
    .eq("user_id", userId)
    .eq("week_end", weekEnd)
    .maybeSingle();
  if (error) {
    logErr("loadWeeklyReview", error);
    throw error;
  }
  if (!data) return null;

  const summary = (data.summary as { moved?: string[]; stuck?: string[] }) ?? {};
  return {
    weekStart: data.week_start as string,
    weekEnd: data.week_end as string,
    moved: summary.moved ?? [],
    stuck: summary.stuck ?? [],
    replan: (data.replanned_steps as string) ?? "",
    celebration: (data.wins as string) ?? "",
    generatedAt: (data.created_at as string) ?? new Date().toISOString(),
  };
}

export async function saveWeeklyReview(
  userId: string,
  review: WeeklyReview
): Promise<void> {
  await ensureUser(userId);
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("weekly_reviews").upsert(
    {
      user_id: userId,
      week_start: review.weekStart,
      week_end: review.weekEnd,
      summary: { moved: review.moved, stuck: review.stuck },
      wins: review.celebration,
      replanned_steps: review.replan,
    },
    { onConflict: "user_id,week_end" }
  );
  if (error) {
    logErr("saveWeeklyReview", error);
    throw error;
  }
}
