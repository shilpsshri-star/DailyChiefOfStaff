"use client";

// DEPRECATED: superseded by lib/guestStore.ts, which generalizes this same
// idea (anonymous localStorage trial, migrated into Supabase on sign-in)
// from a flat list of goal texts to the full Profile + DailyLogs +
// WeeklyReviews guest-mode flow. Nothing in the app imports this file
// anymore; it's kept only so the legacy "cos:draft:goals" key it used is
// still understood (guestStore.clearAllGuestData() also clears that key,
// in case anyone still has it sitting in their browser from before).
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
