/**
 * Best-effort rest-timer completion alerts. No backend/push server exists
 * in this app, so there's no way to guarantee an alert fires while the
 * tab/app is fully suspended in the background — this is the honest
 * ceiling: a sound when the tab is foregrounded/audible, and a
 * Notification fired the instant the app detects completion (in real
 * time if still running, or as an immediate catch-up on next foreground).
 */

const NOTIFICATION_TITLE = 'Rest over';
const NOTIFICATION_BODY = 'Time for your next set.';

/**
 * Called once at workout-session start, not lazily on first rest timer —
 * so the permission prompt is out of the way before it's ever needed,
 * rather than interrupting mid-countdown.
 */
export function requestRestTimerPermission(): void {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'default') return;
  Notification.requestPermission();
}

interface AudioSessionNavigator extends Navigator {
  audioSession?: { type: string };
}

const BEEP_COUNT = 3;
const BEEP_SECONDS = 0.15;
const BEEP_GAP_SECONDS = 0.15;

let audioContext: AudioContext | null = null;

/**
 * Must run inside a real tap, before any await — iOS leaves an AudioContext
 * created or resumed outside a user gesture suspended, which silenced the
 * beep when it fired from the timer's setInterval-driven watch. 'transient'
 * ducks other audio (music) instead of being muted by the ringer switch.
 */
export function unlockRestAudio(): void {
  try {
    const audioSession = (navigator as AudioSessionNavigator).audioSession;
    if (audioSession) audioSession.type = 'transient';
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume();
  } catch {
    // Unsupported browser — bonus cue only.
  }
}

/**
 * Short synthesized beeps — no audio asset to source/license, and it works
 * regardless of whatever theme/build tooling touches static assets.
 */
export function playRestSound(): void {
  const context = audioContext;
  if (!context || context.state !== 'running') return;
  try {
    for (let i = 0; i < BEEP_COUNT; i++) {
      const startAt = context.currentTime + i * (BEEP_SECONDS + BEEP_GAP_SECONDS);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + BEEP_SECONDS);
      oscillator.start(startAt);
      oscillator.stop(startAt + BEEP_SECONDS);
    }
  } catch {
    // The in-app banner already shows 0, this is a bonus cue only.
  }
}

const REST_OVER_VIBRATION_MS = [200, 100, 200, 100, 400];

export function vibrateRestOver(): void {
  // Absent on iOS Safari; optional call keeps this a no-op there.
  navigator.vibrate?.(REST_OVER_VIBRATION_MS);
}

/**
 * Skipped when the document is visible — the in-app banner hitting zero is
 * already the alert in that case, a Notification on top would be redundant.
 */
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
