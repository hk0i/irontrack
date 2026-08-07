// Best-effort rest-timer completion alerts. No backend/push server exists
// in this app, so there's no way to guarantee an alert fires while the
// tab/app is fully suspended in the background — this is the honest
// ceiling: a sound when the tab is foregrounded/audible, and a
// Notification fired the instant the app detects completion (in real
// time if still running, or as an immediate catch-up on next foreground).

const NOTIFICATION_TITLE = 'Rest over';
const NOTIFICATION_BODY = 'Time for your next set.';

// Called once at workout-session start, not lazily on first rest timer —
// so the permission prompt is out of the way before it's ever needed,
// rather than interrupting mid-countdown.
export function requestRestTimerPermission(): void {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'default') return;
  Notification.requestPermission();
}

// Short synthesized beep — no audio asset to source/license, and it works
// regardless of whatever theme/build tooling touches static assets.
export function playRestSound(): void {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.15);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.15);
    oscillator.onended = () => context.close();
  } catch {
    // Autoplay-policy or unsupported-browser failures are silent —
    // the in-app banner already shows 0, this is a bonus cue only.
  }
}

// Skipped when the document is visible — the in-app banner hitting zero is
// already the alert in that case, a Notification on top would be redundant.
export function showRestOverNotification(): void {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (!document.hidden) return;
  try {
    new Notification(NOTIFICATION_TITLE, { body: NOTIFICATION_BODY });
  } catch {
    // Some contexts (e.g. non-secure origin) throw on construction rather
    // than just no-op — this is a bonus cue only, never worth surfacing.
  }
}
