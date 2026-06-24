"use client";

import { EMPTY_PROFILE, Profile } from "./types";

// Client-only storage for the anonymous trial: a user can fill in Onboarding
// without an account. Once they sign in, we migrate this into their real
// per-user profile on the server and clear it.
const DRAFT_KEY = "cos:draft:profile";

export function loadDraft(): Profile {
  if (typeof window === "undefined") return EMPTY_PROFILE;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_PROFILE;
    const parsed = JSON.parse(raw);
    return {
      goals: Array.isArray(parsed.goals) ? parsed.goals : EMPTY_PROFILE.goals,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
    };
  } catch {
    return EMPTY_PROFILE;
  }
}

export function saveDraft(profile: Profile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(profile));
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DRAFT_KEY);
}

export function hasDraft(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DRAFT_KEY) !== null;
}
