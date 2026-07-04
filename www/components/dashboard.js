import { getAllRoutines, deleteRoutine } from '../db.js';

export default {
  props: {
    navParams: { type: Object, default: () => ({}) },
  },
  emits: ['navigate'],
  setup(props, { emit }) {
    const { ref, onMounted } = Vue;
    const routines = ref([]);

    async function loadRoutines() {
      routines.value = await getAllRoutines();
    }

    onMounted(loadRoutines);

    function openRoutine(routine) {
      emit('navigate', 'active-workout', { routineId: routine.id });
    }

    function editRoutine(routine) {
      emit('navigate', 'routine-builder', { routineId: routine.id });
    }

    async function removeRoutine(routine) {
      if (!confirm(`Delete "${routine.name}"? This cannot be undone.`)) return;
      await deleteRoutine(routine.id);
      await loadRoutines();
    }

    return { routines, openRoutine, editRoutine, removeRoutine, emit };
  },
  template: `
    <div class="min-h-screen bg-slate-950 text-slate-100 pb-24">
      <header class="flex items-center justify-between px-4 py-5 sticky top-0 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <h1 class="text-xl font-bold tracking-tight">IronTrack</h1>
        <div class="flex items-center gap-3">
          <button
            @click="emit('navigate', 'body-metrics')"
            aria-label="Body metrics"
            class="w-11 h-11 flex items-center justify-center rounded-full bg-slate-800 active:bg-slate-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="4" y="4" width="16" height="16" rx="3" stroke-linecap="round" stroke-linejoin="round" />
              <circle cx="12" cy="13" r="1" fill="currentColor" stroke="none" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 13l2.5-2M9 7h6" />
            </svg>
          </button>
          <button
            @click="emit('navigate', 'progress-chart')"
            aria-label="Progress charts"
            class="w-11 h-11 flex items-center justify-center rounded-full bg-slate-800 active:bg-slate-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 3v18h18M7 15l4-4 3 3 5-6" />
            </svg>
          </button>
          <button
            @click="emit('navigate', 'settings')"
            aria-label="Settings"
            class="w-11 h-11 flex items-center justify-center rounded-full bg-slate-800 active:bg-slate-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      <main class="px-4 py-4 space-y-3">
        <div v-if="routines.length === 0" class="text-slate-400 text-center mt-16">
          No routines yet. Tap + to build your first one.
        </div>
        <div
          v-for="routine in routines"
          :key="routine.id"
          class="relative bg-slate-900 border border-slate-800 rounded-2xl"
        >
          <button
            @click="openRoutine(routine)"
            class="w-full text-left pl-5 pr-28 py-4 active:bg-slate-800 rounded-2xl"
          >
            <div class="text-lg font-semibold">{{ routine.name }}</div>
            <div class="text-sm text-slate-400 mt-1">{{ routine.exerciseIds.length }} exercises</div>
          </button>
          <button
            @click="editRoutine(routine)"
            :aria-label="'Edit ' + routine.name"
            class="absolute top-1/2 -translate-y-1/2 right-16 w-11 h-11 flex items-center justify-center rounded-full bg-slate-800 active:bg-slate-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487a2.06 2.06 0 112.914 2.914L7.5 19.675l-4 1 1-4L16.862 4.487z" />
            </svg>
          </button>
          <button
            @click="removeRoutine(routine)"
            :aria-label="'Delete ' + routine.name"
            class="absolute top-1/2 -translate-y-1/2 right-3 w-11 h-11 flex items-center justify-center rounded-full bg-rose-950 text-rose-400 active:bg-rose-900"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-8 0l1 13a2 2 0 002 2h4a2 2 0 002-2l1-13" />
            </svg>
          </button>
        </div>
      </main>

      <button
        @click="emit('navigate', 'routine-builder')"
        aria-label="New routine"
        class="fixed bottom-6 right-6 w-16 h-16 rounded-full bg-emerald-500 text-slate-950 text-3xl font-bold flex items-center justify-center shadow-lg active:bg-emerald-400"
      >
        +
      </button>
    </div>
  `,
};
