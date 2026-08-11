/**
 * Tracks the single in-progress workout session, if any, so it survives
 * navigating away from ActiveWorkoutScreen (which otherwise unmounts and
 * discards all its local state — see App.vue's screen switcher). Mirrors
 * store.ts's localStorage-backed reactive singleton pattern; kept separate
 * from store.ts since that file is scoped to UI preferences, not workout
 * data. Only one active session is tracked app-wide.
 */

import { reactive } from 'vue';

const STORAGE_KEY = 'activeSession';

export interface ActiveSession {
  sessionId: string;
  routineId: string;
  startedAt: number;
}

function loadActiveSession(): ActiveSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ActiveSession;
  } catch {
    return null;
  }
}

export const activeSession: { current: ActiveSession | null } = reactive({
  current: loadActiveSession(),
});

export function setActiveSession(session: ActiveSession): void {
  activeSession.current = session;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearActiveSession(): void {
  activeSession.current = null;
  localStorage.removeItem(STORAGE_KEY);
}
