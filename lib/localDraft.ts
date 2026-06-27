"use client";

// Client-only storage for the anonymous trial: a guest can jot down their
// goals on the Onboarding page without an account. Once they sign in, we
// migrate this into their real per-user profile on the server and clear it.
const DRAFT_KEY = "cos:draft:goals";

export function loadDraftGoals(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((g): g is string => typeof g === "string")
      : [];
  } catch {
    return [];
  }
}

export function saveDraftGoals(goals: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(goals));
}

export function clearDraftGoals(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DRAFT_KEY);
}

export function hasDraftGoals(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DRAFT_KEY) !== null;
}
