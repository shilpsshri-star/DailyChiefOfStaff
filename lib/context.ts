import { Profile } from "./types";

// Builds the shared "system context" string that's injected into every
// Claude call so the AI always knows the user's goals and current tasks.
export function buildProfileContext(profile: Profile): string {
  const goals = profile.goals.filter((g) => g.text.trim().length > 0);
  const goalsText = goals.length
    ? goals
        .map((g, i) => `${i + 1}. ${g.text}${g.achieved ? " (achieved!)" : ""}`)
        .join("\n")
    : "(no goals set yet)";

  const openTasks = profile.tasks.filter((t) => !t.done);
  const doneTasks = profile.tasks.filter((t) => t.done);

  const openTasksText = openTasks.length
    ? openTasks.map((t) => `- [ ] ${t.text}`).join("\n")
    : "(no open tasks)";

  const doneTasksText = doneTasks.length
    ? doneTasks.map((t) => `- [x] ${t.text}`).join("\n")
    : "(none completed yet)";

  return [
    "USER GOALS (in priority order, set during onboarding):",
    goalsText,
    "",
    "OPEN TASKS:",
    openTasksText,
    "",
    "COMPLETED TASKS:",
    doneTasksText,
  ].join("\n");
}
