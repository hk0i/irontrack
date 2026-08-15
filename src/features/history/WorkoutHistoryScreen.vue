<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  getAllSets,
  getAllExercises,
  getAllRoutines,
  getAllWorkoutSessions,
  type SetEntry,
  type WorkoutSession,
} from '../../shared/db';
import { formatDate, formatDuration } from '../../shared/dateFormat';
import ScreenHeader from '../../shared/components/ScreenHeader.vue';
import EmptyState from '../../shared/components/EmptyState.vue';
import type { NavParams, ScreenName } from '../../shared/types';

defineProps<{
  navParams?: NavParams;
}>();
const emit = defineEmits<{
  navigate: [screen: ScreenName, params?: NavParams];
}>();

interface DayGroup {
  key: string;
  date: string;
  label: string;
  routineName: string | null;
  routineId: string | null;
  sessionId: string | null;
  durations: string[];
  mood?: string;
  note?: string;
  exerciseNames: string[];
  setCount: number;
  sortTs: number;
}

const days = ref<DayGroup[]>([]);

interface SessionAccumulator {
  date: string;
  routineId: string | null;
  sessionId: string | null;
  byExercise: Map<string, SetEntry[]>;
}

onMounted(async () => {
  const [sets, exercises, routines, workoutSessions] = await Promise.all([
    getAllSets(),
    getAllExercises(),
    getAllRoutines(),
    getAllWorkoutSessions(),
  ]);
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  const routineById = new Map(routines.map((r) => [r.id, r]));
  const workoutById = new Map(workoutSessions.map((s) => [s.id, s]));

  // Legacy fallback only: sets logged before sessionId existed have no
  // way to tell two same-day sessions of the same routine apart, so they
  // still merge onto one card, listing each matching duration as its own
  // pill rather than picking one.
  const legacySessionsByKey = new Map<string, WorkoutSession[]>();
  for (const session of workoutSessions) {
    const key = `${session.date}::${session.routineId || 'none'}`;
    if (!legacySessionsByKey.has(key)) legacySessionsByKey.set(key, []);
    legacySessionsByKey.get(key)!.push(session);
  }

  // Grouped by sessionId when a set has one — that's what keeps two
  // separate same-day sessions of the same routine as two separate
  // cards instead of merging their sets together. Falls back to the old
  // date+routine key for sets logged before sessionId existed.
  const bySession = new Map<string, SessionAccumulator>();
  for (const set of sets) {
    const sessionKey = set.sessionId ? `session::${set.sessionId}` : `legacy::${set.date}::${set.routineId || 'none'}`;
    if (!bySession.has(sessionKey)) {
      bySession.set(sessionKey, { date: set.date, routineId: set.routineId || null, sessionId: set.sessionId || null, byExercise: new Map() });
    }
    const session = bySession.get(sessionKey)!;
    if (!session.byExercise.has(set.exerciseId)) session.byExercise.set(set.exerciseId, []);
    session.byExercise.get(set.exerciseId)!.push(set);
  }

  days.value = [...bySession.entries()].map(([key, session]) => {
    let durations: string[];
    let mood: string | undefined;
    let note: string | undefined;
    if (session.sessionId) {
      const match = workoutById.get(session.sessionId);
      durations = match ? [formatDuration(match.durationMs)] : [];
      // Only set for a direct sessionId match — a legacy-grouped card can
      // represent more than one session, and there's no single mood/note to
      // attribute the merged card to, so those cards simply show neither.
      mood = match?.mood;
      note = match?.note;
    } else {
      const legacyKey = `${session.date}::${session.routineId || 'none'}`;
      durations = (legacySessionsByKey.get(legacyKey) || []).map((s) => formatDuration(s.durationMs));
    }
    const allSets = [...session.byExercise.values()].flat();
    // Recency isn't guaranteed by Map insertion order — a real session uses
    // its startedAt, a legacy card (no WorkoutSession row) falls back to
    // the latest createdAt among its own sets.
    const sortTs = session.sessionId
      ? (workoutById.get(session.sessionId)?.startedAt ?? 0)
      : Math.max(0, ...allSets.map((s) => s.createdAt || 0));
    return {
      // Unique per card even when two sessions share a date+routine, so
      // Vue's v-for :key never collides between them.
      key,
      date: session.date,
      label: formatDate(session.date),
      routineName: (session.routineId && routineById.get(session.routineId)?.name) || null,
      routineId: session.routineId,
      sessionId: session.sessionId,
      durations,
      mood,
      note,
      exerciseNames: [...session.byExercise.keys()].map((exerciseId) => exerciseById.get(exerciseId)?.name || 'Unknown exercise'),
      setCount: allSets.length,
      sortTs,
    };
  }).sort((a, b) => b.sortTs - a.sortTs);
});

function openDetail(day: DayGroup) {
  emit(
    'navigate',
    'workout-session-detail',
    day.sessionId
      ? { sessionId: day.sessionId }
      : { sessionDate: day.date, routineId: day.routineId ?? undefined },
  );
}

</script>

<template>
  <div class="min-h-screen bg-background text-foreground pb-10">
    <ScreenHeader title="Workout History" @back="emit('navigate', 'dashboard')" />

    <main class="px-4 py-4 space-y-4">
      <EmptyState v-if="days.length === 0">No workouts logged yet.</EmptyState>

      <button
        v-for="day in days"
        :key="day.key"
        type="button"
        @click="openDetail(day)"
        class="w-full flex items-center gap-3 text-left bg-surface border border-border rounded-2xl p-4 active:bg-surface-2"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2">
            <h2 class="text-lg font-semibold text-foreground">{{ day.routineName || 'Workout' }}</h2>
            <div v-if="day.durations.length || day.mood" class="flex flex-wrap justify-end gap-1.5">
              <span
                v-if="day.mood"
                class="text-base font-semibold bg-surface-2 px-3 py-1.5 rounded-full whitespace-nowrap"
              >{{ day.mood }}</span>
              <span
                v-for="(duration, i) in day.durations"
                :key="i"
                class="text-sm font-semibold text-primary-bright bg-primary/10 px-3 py-1.5 rounded-full whitespace-nowrap"
              >{{ duration }}</span>
            </div>
          </div>
          <div class="text-base text-foreground-muted mt-0.5">{{ day.label }}</div>
          <p v-if="day.note" class="text-sm text-foreground-muted mt-1 italic">{{ day.note }}</p>
          <p class="text-base text-foreground-subtle mt-2">
            {{ day.exerciseNames.join(', ') }} · {{ day.setCount }} {{ day.setCount === 1 ? 'set' : 'sets' }}
          </p>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-foreground-muted flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </main>
  </div>
</template>
