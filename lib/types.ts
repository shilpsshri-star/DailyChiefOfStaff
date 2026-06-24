export interface Task {
  id: string;
  text: string;
  done: boolean;
}

export interface Goal {
  text: string;
  achieved: boolean;
}

export interface Profile {
  goals: Goal[]; // exactly 5 goals, may contain empty text if unset
  tasks: Task[];
  updatedAt: string;
}

export interface BriefingPriority {
  task: string;
  reasoning: string;
}

export interface Briefing {
  date: string; // YYYY-MM-DD
  priorities: BriefingPriority[];
  raw: string;
  generatedAt: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  at: string;
}

export interface EndOfDaySummary {
  date: string;
  completedTaskIds: string[];
  summary: string;
  generatedAt: string;
}

export const EMPTY_GOAL: Goal = { text: "", achieved: false };

export const EMPTY_PROFILE: Profile = {
  goals: [
    { ...EMPTY_GOAL },
    { ...EMPTY_GOAL },
    { ...EMPTY_GOAL },
    { ...EMPTY_GOAL },
    { ...EMPTY_GOAL },
  ],
  tasks: [],
  updatedAt: new Date(0).toISOString(),
};

export interface UserStats {
  activeDates: string[]; // sorted ascending, YYYY-MM-DD, days the user did anything meaningful
  completedByDate: Record<string, number>; // date -> # of tasks marked done that day (from EOD)
  totalTasksCompleted: number;
  totalGoalsAchieved: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
}

export const EMPTY_STATS: UserStats = {
  activeDates: [],
  completedByDate: {},
  totalTasksCompleted: 0,
  totalGoalsAchieved: 0,
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
