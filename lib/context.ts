// No longer used: the free-form chat that consumed this context string was
// removed in favor of the structured goal -> milestone -> step workflow
// (see lib/planner.ts, lib/goals.ts). Kept as a no-op stub so nothing
// breaks if anything still imports it.
export function buildProfileContext(): string {
  return "";
}
