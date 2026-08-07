<script setup lang="ts">
// Mounted once, app-wide, in App.vue (outside the screen switcher) — that's
// what makes the rest timer survive navigation: this component stays
// mounted no matter which screen is showing, so it keeps ticking and stays
// visible even after backing out of ActiveWorkoutScreen mid-rest.
import { onMounted, watch } from 'vue';
import { restTimer, secondsLeft, clearRestTimer } from '../rest-timer';
import { playRestSound, showRestOverNotification } from '../rest-alert';

// A timer that was already expired before this component ever mounted —
// e.g. the page was reloaded, or an installed PWA was reopened after
// being fully evicted, hours after a rest period ended — has no "previous
// value" for the watch below to transition from, so it'd never get
// cleared on its own. Cleaned up silently here instead: there's no way to
// tell "expired 5 seconds ago" from "expired 5 hours ago" at this point,
// so firing a sound/notification for it would be more wrong than right.
onMounted(() => {
  if (restTimer.endAt !== null && secondsLeft.value === 0) {
    clearRestTimer();
  }
});

// The one place *live* completion side effects live — fires exactly once
// per timer, on the transition into zero while this component was already
// mounted and watching (covers both a timer completing in the foreground
// and the instant-catch-up when the tab wakes from a shorter background
// spell, via rest-timer.ts's visibilitychange listener).
watch(secondsLeft, (value, previous) => {
  if (value === 0 && previous > 0 && restTimer.endAt !== null) {
    clearRestTimer();
    playRestSound();
    showRestOverNotification();
  }
});
</script>

<template>
  <div
    v-if="restTimer.endAt !== null"
    class="fixed inset-x-0 bottom-0 bg-primary-strong text-on-primary px-4 py-4 flex items-center justify-between font-semibold"
  >
    <span>Rest: {{ secondsLeft }}s</span>
    <button @click="clearRestTimer" class="px-4 py-2 rounded-lg bg-background/25 active:bg-background/40">Skip</button>
  </div>
</template>
