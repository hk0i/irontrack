<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getAllRoutines, deleteRoutine, getAllSets, type Routine } from '../../shared/db';
import { activeSession, clearActiveSession } from '../../shared/active-session';
import { appUpdate, installAppUpdate } from '../../shared/app-update';
import { confirmThenDelete } from '../../shared/confirm';
import IconButton from '../../shared/components/IconButton.vue';
import EmptyState from '../../shared/components/EmptyState.vue';
import type { NavParams, ScreenName } from '../../shared/types';

defineProps<{
  navParams?: NavParams;
}>();
const emit = defineEmits<{
  navigate: [screen: ScreenName, params?: NavParams];
}>();

// __APP_VERSION__/__COMMIT_HASH__ are Vite `define` constants (see
// vite.config.js) substituted at build time — assigned to local consts here
// rather than referenced directly in the template, since <script setup>'s
// template only reliably resolves identifiers it has itself exposed.
const APP_VERSION = __APP_VERSION__;
const COMMIT_HASH = __COMMIT_HASH__;

const routines = ref<Routine[]>([]);
const suggestedRoutine = ref<Routine | null>(null);
const resumableRoutine = ref<Routine | null>(null);

async function loadRoutines() {
  routines.value = await getAllRoutines();
  resumableRoutine.value = await resolveResumableRoutine(routines.value);
  suggestedRoutine.value = await computeSuggestedRoutine(routines.value);
}

// An unfinished workout takes priority over the normal rotation
// suggestion — it's the thing the user was already in the middle of. If
// its routine has since been deleted, the session can't be shown or
// resumed meaningfully, so the stale pointer is cleared here rather than
// left to surface a broken "Resume" card.
async function resolveResumableRoutine(currentRoutines: Routine[]): Promise<Routine | null> {
  if (!activeSession.current) return null;
  const routine = currentRoutines.find((r) => r.id === activeSession.current!.routineId) || null;
  if (!routine) clearActiveSession();
  return routine;
}

// Rotates through the routine list in whatever order it's displayed:
// find the routine the most recently logged set belonged to, and
// suggest the next one after it, wrapping back to the start. Completion
// -based rather than calendar-based, so rest days don't throw it off.
// Defaults to the first routine if there's no history yet, or the last
// one performed has since been deleted.
async function computeSuggestedRoutine(currentRoutines: Routine[]): Promise<Routine | null> {
  if (currentRoutines.length === 0) return null;
  const sets = await getAllSets();
  const lastRoutineId = sets.find((s) => s.routineId)?.routineId || null;
  const lastIndex = lastRoutineId ? currentRoutines.findIndex((r) => r.id === lastRoutineId) : -1;
  const nextIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % currentRoutines.length;
  return currentRoutines[nextIndex];
}

onMounted(loadRoutines);

function openRoutine(routine: Routine) {
  emit('navigate', 'active-workout', { routineId: routine.id });
}

function editRoutine(routine: Routine) {
  emit('navigate', 'routine-builder', { routineId: routine.id });
}

async function removeRoutine(routine: Routine) {
  await confirmThenDelete(`Delete "${routine.name}"? This cannot be undone.`, async () => {
    await deleteRoutine(routine.id);
    await loadRoutines();
  });
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground pb-24">
    <header class="flex items-center justify-between px-4 py-5 sticky top-0 bg-background/95 backdrop-blur border-b border-border">
      <h1 class="text-xl font-bold tracking-tight">IronTrack</h1>
      <div class="flex items-center gap-3">
        <IconButton @click="emit('navigate', 'body-metrics')" aria-label="Body metrics">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="4" y="4" width="16" height="16" rx="3" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="12" cy="13" r="1" fill="currentColor" stroke="none" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 13l2.5-2M9 7h6" />
          </svg>
        </IconButton>
        <IconButton @click="emit('navigate', 'progress-chart')" aria-label="Progress charts">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 3v18h18M7 15l4-4 3 3 5-6" />
          </svg>
        </IconButton>
        <IconButton @click="emit('navigate', 'workout-history')" aria-label="Workout history">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9" stroke-linecap="round" stroke-linejoin="round" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3.5 2" />
          </svg>
        </IconButton>
        <IconButton @click="emit('navigate', 'settings')" aria-label="Settings">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </IconButton>
        <IconButton v-if="appUpdate.available" @click="installAppUpdate()" aria-label="Install update" tone="success">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
        </IconButton>
      </div>
    </header>

    <main class="px-4 py-4 space-y-3">
      <EmptyState v-if="routines.length === 0">No routines yet. Tap + to build your first one.</EmptyState>

      <button
        v-if="resumableRoutine"
        @click="openRoutine(resumableRoutine)"
        class="w-full text-left bg-primary/10 border-2 border-primary-strong rounded-2xl px-5 py-4 active:bg-primary/15"
      >
        <div class="text-xs uppercase tracking-wide text-primary-bright font-semibold mb-1">Resume</div>
        <div class="text-lg font-semibold">{{ resumableRoutine.name }}</div>
        <div class="text-sm text-foreground-muted mt-1">Unfinished workout in progress</div>
      </button>
      <button
        v-else-if="suggestedRoutine"
        @click="openRoutine(suggestedRoutine)"
        class="w-full text-left bg-primary/10 border-2 border-primary-strong rounded-2xl px-5 py-4 active:bg-primary/15"
      >
        <div class="text-xs uppercase tracking-wide text-primary-bright font-semibold mb-1">Suggested</div>
        <div class="text-lg font-semibold">{{ suggestedRoutine.name }}</div>
        <div class="text-sm text-foreground-muted mt-1">{{ suggestedRoutine.exerciseIds.length }} exercises</div>
      </button>

      <div
        v-for="routine in routines"
        :key="routine.id"
        class="relative bg-surface border border-border rounded-2xl"
      >
        <button
          @click="openRoutine(routine)"
          class="w-full text-left pl-5 pr-28 py-4 active:bg-surface-2 rounded-2xl"
        >
          <div class="text-lg font-semibold">{{ routine.name }}</div>
          <div class="text-sm text-foreground-muted mt-1">{{ routine.exerciseIds.length }} exercises</div>
        </button>
        <IconButton @click="editRoutine(routine)" :aria-label="'Edit ' + routine.name" class="absolute top-1/2 -translate-y-1/2 right-16">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487a2.06 2.06 0 112.914 2.914L7.5 19.675l-4 1 1-4L16.862 4.487z" />
          </svg>
        </IconButton>
        <IconButton @click="removeRoutine(routine)" :aria-label="'Delete ' + routine.name" tone="danger" class="absolute top-1/2 -translate-y-1/2 right-3">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-8 0l1 13a2 2 0 002 2h4a2 2 0 002-2l1-13" />
          </svg>
        </IconButton>
      </div>
    </main>

    <button
      @click="emit('navigate', 'routine-builder')"
      aria-label="New routine"
      class="fixed bottom-6 right-6 w-16 h-16 rounded-full bg-primary text-on-primary text-3xl font-bold flex items-center justify-center shadow-lg active:bg-primary-bright"
    >
      +
    </button>

    <div class="fixed bottom-2 left-3 text-xs text-foreground-faintest select-none">v{{ APP_VERSION }} ({{ COMMIT_HASH }})</div>
  </div>
</template>
