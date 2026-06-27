// Core data model for the Daily Chief of Staff goal-execution workflow.
//
// Hierarchy: Goal -> Milestones (3-5) -> Steps (5-7, only generated for the
// active milestone). Steps are the unit of daily work. Daily logs record
// what was focused on each morning and what actually happened each evening.
// Weekly reviews summarize a rolling 7-day window per user.

export type StepStatus = "pending" | "active" | "done" | "blocked" | "skipped";
export type MilestoneStatus = "proposed" | "confirmed" | "completed";
export type GoalStatus = "inactive" | "active" | "completed";

export interface Step {
  id: string;
  text: string; // concrete action
  output: string; // what "done" looks like for this step
  estimatedDays: number;
  dependencies: string[]; // ids of other steps within the same milestone that must be done first
  status: StepStatus;
  order: number;
}

export interface Milestone {
  id: string;
  text: string;
  order: number;
  status: MilestoneStatus;
  steps: Step[]; // only populated once this milestone has been broken down
}

export interface Goal {
  id: string;
  text: string; // free-text, exactly as the user entered it
  createdAt: string;
  status: GoalStatus;
  milestones: Milestone[]; // populated once the user triggers activation
}

export interface Profile {
  goals: Goal[]; // 1-5 goals
  updatedAt: string;
}

export const EMPTY_PROFILE: Profile = {
  goals: [],
  updatedAt: new Date(0).toISOString(),
};

export interface DailyFocusItem {
  stepId: string;
  goalId: string;
  milestoneId: string;
  goalText: string;
  milestoneText: string;
  stepText: string;
  reasoning: string;
}

export type DailyResultStatus = "done" | "blocked" | "skipped";

export interface DailyResult {
  stepId: string;
  status: DailyResultStatus;
  note: string; // one-line reason, required
}

export interface DailyLog {
  date: string; // YYYY-MM-DD
  focusItems: DailyFocusItem[];
  results: DailyResult[];
  adjustmentNote: string; // AI's reaction to what happened, written at evening check-in
  morningGeneratedAt: string | null;
  eveningCompletedAt: string | null;
}

export const EMPTY_DAILY_LOG = (date: string): DailyLog => ({
  date,
  focusItems: [],
  results: [],
  adjustmentNote: "",
  morningGeneratedAt: null,
  eveningCompletedAt: null,
});

export interface WeeklyReview {
  weekStart: string; // YYYY-MM-DD, 7 days before weekEnd
  weekEnd: string; // YYYY-MM-DD, the date the review was generated
  moved: string[]; // bullet strings: what progressed this week
  stuck: string[]; // bullet strings: what's stuck and why
  replan: string; // AI's replanned next sprint, prose
  celebration: string; // explicit win celebration, prose
  generatedAt: string;
}

export interface UserMeta {
  onboardedAt: string | null;
  lastWeeklyReviewDate: string | null; // YYYY-MM-DD
}

export const EMPTY_META: UserMeta = {
  onboardedAt: null,
  lastWeeklyReviewDate: null,
};

export interface UserStats {
  activeDates: string[]; // sorted ascending, YYYY-MM-DD, days the user did anything meaningful
  completedByDate: Record<string, number>; // date -> # of steps marked done that day
  totalStepsCompleted: number;
  totalGoalsCompleted: number;
  totalMilestonesCompleted: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
}

export const EMPTY_STATS: UserStats = {
  activeDates: [],
  completedByDate: {},
  totalStepsCompleted: 0,
  totalGoalsCompleted: 0,
  totalMilestonesCompleted: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: null,
};

export interface Badge {
  id: string;
  label: string;
  description: string;
  emoji: string;
}
