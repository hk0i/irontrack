import { watch } from 'vue';
import { activeSession } from './active-session';

let sentinel: WakeLockSentinel | null = null;

async function requestWakeLock(): Promise<void> {
  if (!('wakeLock' in navigator) || sentinel || document.hidden) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // Low battery or unsupported context — the screen just auto-locks as before.
  }
}

async function releaseWakeLock(): Promise<void> {
  const held = sentinel;
  sentinel = null;
  await held?.release();
}

/**
 * Keeps the screen on for the whole active session so the app stays in the
 * foreground and the rest timer's tick and alert fire on time. Driven off
 * activeSession so every start/finish/cancel path (and a resume after
 * reload) is covered without touching each caller.
 */
export function initWorkoutWakeLock(): void {
  const hasActiveSession = () => activeSession.current !== null;

  watch(hasActiveSession, (isActive) => {
    if (isActive) requestWakeLock();
    else releaseWakeLock();
  }, { immediate: true });

  // The browser drops the lock whenever the page is hidden, so it has to be re-acquired on return.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && hasActiveSession()) requestWakeLock();
  });
}
