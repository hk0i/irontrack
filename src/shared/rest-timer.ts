// Wall-clock rest timer, mirroring active-session.ts's localStorage-backed
// reactive singleton pattern. Tracking an end timestamp instead of
// decrementing a counter is what makes this correct across both mobile
// backgrounding (a plain setInterval throttles/pauses in a backgrounded
// tab and drifts) and navigating away from ActiveWorkoutScreen (which
// unmounts and would otherwise destroy component-local timer state).
// Deliberately has no sound/notification side effects of its own — single
// responsibility, kept in rest-alert.ts / the component that watches
// secondsLeft for the 0-crossing.

import { reactive, ref, computed } from 'vue';

const STORAGE_KEY = 'restTimerEndAt';

function loadEndAt(): number | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

export const restTimer: { endAt: number | null } = reactive({
  endAt: loadEndAt(),
});

// Only ticks while a timer is actually running — no interval sitting idle
// the rest of the time. visibilitychange/focus force an immediate
// recompute the moment the tab wakes, rather than waiting for the next
// scheduled tick (which itself may have been throttled while hidden).
const now = ref(Date.now());
let tickInterval: ReturnType<typeof setInterval> | null = null;

function refreshNow() {
  now.value = Date.now();
}

function ensureTicking() {
  if (tickInterval || restTimer.endAt === null) return;
  tickInterval = setInterval(refreshNow, 1000);
}

function stopTicking() {
  if (!tickInterval) return;
  clearInterval(tickInterval);
  tickInterval = null;
}

document.addEventListener('visibilitychange', refreshNow);
window.addEventListener('focus', refreshNow);

export const secondsLeft = computed(() => {
  if (restTimer.endAt === null) return 0;
  return Math.max(0, Math.ceil((restTimer.endAt - now.value) / 1000));
});

export function startRestTimer(seconds: number): void {
  const endAt = Date.now() + seconds * 1000;
  restTimer.endAt = endAt;
  localStorage.setItem(STORAGE_KEY, String(endAt));
  refreshNow();
  ensureTicking();
}

export function clearRestTimer(): void {
  restTimer.endAt = null;
  localStorage.removeItem(STORAGE_KEY);
  stopTicking();
}

// A timer already running (endAt loaded from storage) on module init needs
// its tick restarted — e.g. the page was reloaded mid-rest.
ensureTicking();
