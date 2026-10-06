# EDD: Rest Timer Alerts That Actually Fire

| | |
|---|---|
| **Date** | 2026-10-05 |
| **Author** | Gregory McQuillan |

## Goal

The rest timer itself is accurate (`rest-timer.ts` tracks a wall-clock `endAt`), but in real iOS workout sessions the end of a rest period goes **unnoticed**:

- **Notifications arrive late.** A workout on Apple Watch/iPhone turns on the Fitness Focus (or DND is already on). iOS holds the `Notification` from `showRestOverNotification()` (`rest-alert.ts:51`) and delivers it only after the Focus ends, which makes it useless as a cue.
- **The beep is probably silent.** `playRestSound()` (`rest-alert.ts:28`) builds a new `AudioContext` inside `RestTimerBanner.vue`'s `watch(secondsLeft)`, and that watch is driven by a `setInterval` tick, not a user tap. iOS starts a context created without a user gesture in the `suspended` state, so nothing plays. Even when it does play, Web Audio's default session follows the ringer switch.
- **A locked screen suspends everything.** With no backend, nothing fires on time once iOS locks the screen and suspends the PWA's JS. Today's design accepts this already (see `rest-alert.ts` header comment).
- **The notification permission prompt may never appear on iOS.** `requestRestTimerPermission()` runs during `ActiveWorkoutScreen.vue` setup (line 129), not inside a tap, and iOS only shows the prompt in response to user activation.

Goal: give an on-time cue that is hard to miss, on the phone, while the app is open during a workout. That means an audible beep that ducks music, the screen kept awake so JS keeps running, and vibration where the platform supports it.

Decisions locked in with the user, not re-litigated here:
1. **Ducking music is acceptable.** Set `navigator.audioSession.type = 'transient'` so Spotify and similar apps dip under the beep and then resume, and the ringer switch doesn't mute it. This must be confirmed on a device (see Verification); `'transient-solo'` and `'playback'` are the fallbacks to try.
2. **Wake Lock is on by default during an active workout**, with a Settings toggle to turn it off because it costs battery.
3. **A watch buzz is out of scope** (see Future work).

## Platform constraints (why this shape)

| Cue | iOS PWA | Android Chrome | Notes |
|---|---|---|---|
| Web Audio beep | Yes, but only after a context has been resumed inside a user gesture | Yes | Fixed by one shared context, unlocked on a tap |
| `navigator.audioSession` | Yes (Safari 16.4+) | No (feature-detect) | Controls ducking and the ringer switch |
| Screen Wake Lock | Yes (home-screen PWAs reliable from iOS 18.4) | Yes | Released whenever the page is hidden, so it must be re-requested |
| `navigator.vibrate` | **No** | Yes | No-op on iOS |
| Notification while foreground | Suppressed by our own `!document.hidden` check | Same | The banner is the cue in the foreground |
| Watch tap | Only through notifications mirrored from the phone, and only while the phone is **locked** | n/a | Conflicts with Wake Lock; see Future work |

Wake Lock is what makes the rest of the plan work. If the screen stays on, the app stays in the foreground, the 1s tick keeps running, and the unlocked beep fires on time. That is the most a static PWA can offer.

## Changes

### 1. `src/shared/rest-alert.ts`: shared, gesture-unlocked audio
- A module-level `let audioContext: AudioContext | null`, created lazily.
- `unlockRestAudio()`: creates the context if it doesn't exist and calls `resume()`. When `navigator.audioSession` exists, it sets `.type = 'transient'`. Declare a small local type for it, since `lib.dom` may not include it.
- `playRestSound()` reuses the shared context. It plays 3 short 880Hz beeps over about 1s instead of a single 0.15s blip, and no longer calls `close()` per beep. If the context is missing or `suspended`, it does nothing (same best-effort contract as today).
- `ActiveWorkoutScreen.vue` `checkRow`: call `unlockRestAudio()` as the **first statement**, before any `await`. The user activation from the tap is gone after the Dexie `logSet`/`updateSet` await, and `startRestTimer` runs after that await.

### 2. `src/shared/wake-lock.ts` (new)
- `acquireWorkoutWakeLock()` / `releaseWorkoutWakeLock()`, keeping a module-level `WakeLockSentinel | null` and an `isWakeLockWanted` flag.
- Feature-detect `'wakeLock' in navigator`. Ignore rejections (low battery, unsupported context).
- A `visibilitychange` listener re-requests the lock when the page becomes visible and `isWakeLockWanted` is set.
- Acquire it next to `setActiveSession(...)` in `ActiveWorkoutScreen.vue` (~line 127). Also call it again from the `checkRow` tap, in case iOS requires a gesture.
- Release it wherever the session ends (callers of `clearActiveSession`).

### 3. `src/shared/rest-alert.ts`: vibrate
- `vibrateRestOver()`: `navigator.vibrate?.([200, 100, 200, 100, 400])`.
- Called beside `playRestSound()` in `RestTimerBanner.vue`'s completion watch (lines 30–36), which stays the single place for live completion side effects.

### 4. `src/shared/store.ts` + `src/features/settings/SettingsScreen.vue`: toggles
Follows the existing pattern: a key const, a loader with a default, and a setter that writes both the reactive field and localStorage. Storage keys match the field names exactly:

```ts
isRestSoundEnabled: boolean;      // default true
isRestVibrationEnabled: boolean;  // default true
isWakeLockEnabled: boolean;       // default true
```

- Gate steps 1–3 on these.
- UI sits near the rest-duration inputs (`SettingsScreen.vue` ~151–176) and uses the existing `SegmentedToggle`.
- Add a **"Test alert"** button. Tapping it unlocks audio, then plays the sound and vibrates, so the cue can be checked on a device without waiting out a rest.

### 5. `ActiveWorkoutScreen.vue`: request notification permission from a tap
Move `requestRestTimerPermission()` out of setup and into the `checkRow` tap path, alongside `unlockRestAudio()`, so iOS actually shows the prompt. It still no-ops once permission is no longer `'default'`.

### 6. `CHANGELOG.md`
A user-facing entry under the next version.

## Zero-code user action

On iPhone, go to **Settings → Focus → Fitness** (and **Do Not Disturb**) **→ Allowed Notifications → Apps** and add the IronTrack home-screen app. Notifications can then break through Focus. This doesn't make them arrive on time while the phone is locked (JS is still suspended), but it stops the "flood after the workout" behavior.

## Out of scope / future work

- **On-time watch tap / locked-screen alert.** This needs server-scheduled **Web Push**. At `startRestTimer`, POST `endAt` and the push subscription to a small backend (e.g. a Cloudflare Worker with VAPID and a Durable Object alarm). The backend sends the push at `endAt`, and `sw.js` gains `push` / `notificationclick` handlers. The phone has to be locked for iOS to mirror the push to the watch, so this is an alternative to Wake Lock, not an addition. Planned as a separate sequence if wanted.
- Custom sounds or audio assets. The synthesized beep is enough.
- Keeping the app alive in the background with a silent looping `<audio>`. It's fragile, drains battery, and goes against the honest ceiling the app already documents.

## Sequencing

Each step is atomic and can be committed on its own, with `npm run type-check && npm run build` passing at every stop:

0. This doc. No code changes.
1. Shared gesture-unlocked `AudioContext` + `audioSession`, 3-beep cue, `unlockRestAudio()` at the top of `checkRow`.
2. `wake-lock.ts` + acquire/release around the active session (always on, no setting yet).
3. `vibrateRestOver()` wired into `RestTimerBanner.vue`.
4. The three Settings toggles + gating + "Test alert" button.
5. `requestRestTimerPermission()` moved into the tap path.
6. CHANGELOG entry.

## Verification

There is no test framework, so after each step run `npm run type-check && npm run build`.

On a device, use a real iPhone with the app installed to the home screen, served over **HTTPS**. Use the Pages deploy or an HTTPS tunnel: `vite preview --host` over LAN HTTP is not a secure context, and the service worker is disabled in dev. Set regular rest to about 10s to make the checks quick.

- **Step 1:** Play music, turn the ringer switch off, and check a set. The beep should be audible and the music should duck and then resume. If `'transient'` misbehaves, try `'transient-solo'` and then `'playback'` before committing.
- **Step 2:** Start a workout and leave the phone idle past auto-lock. The screen should stay on. Background the app, return, and the lock should be held again. Finish the workout, and the screen should auto-lock normally again.
- **Step 3:** On Android Chrome, the phone vibrates at the end of rest. On iOS, there are no errors.
- **Step 4:** The toggles persist across reloads, each one gates its cue, and "Test alert" works.
- **Step 5:** After a fresh install (or with the permission reset), the prompt appears on the first set check.
