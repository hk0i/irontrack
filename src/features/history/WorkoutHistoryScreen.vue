<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  getAllSets,
  getAllExercises,
  getAllRoutines,
  getAllWorkoutSessions,
  formatWeight,
  type ResistanceType,
  type SetEntry,
  type WorkoutSession,
} from '../../shared/db';
import { settings } from '../../shared/store';
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

interface ExerciseGroup {
  name: string;
  resistanceType: ResistanceType;
  sets: SetEntry[];
}

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
  exercises: ExerciseGroup[];
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
      exercises: [...session.byExercise.entries()].map(([exerciseId, exerciseSets]) => ({
        name: exerciseById.get(exerciseId)?.name || 'Unknown exercise',
        resistanceType: exerciseById.get(exerciseId)?.resistanceType || 'weight',
        sets: exerciseSets,
      })),
    };
  });
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

function formattedSet(set: SetEntry) {
  const weight = formatWeight(set.weightInLbs, settings.preferredUnit);
  return set.weightInLbs ? `${weight} ${settings.preferredUnit} x ${set.reps}` : `${set.reps} reps`;
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground pb-10">
    <ScreenHeader title="Workout History" @back="emit('navigate', 'dashboard')" />

    <main class="px-4 py-4 space-y-4">
      <EmptyState v-if="days.length === 0">No workouts logged yet.</EmptyState>

      <div
        v-for="day in days"
        :key="day.key"
        class="bg-surface border border-border rounded-2xl p-4"
      >
        <div class="mb-3">
          <div class="flex items-start justify-between gap-2">
            <button type="button" @click="openDetail(day)" class="text-left">
              <h2 class="font-semibold text-base underline decoration-dotted">{{ day.routineName || 'Workout' }}</h2>
            </button>
            <div v-if="day.durations.length || day.mood" class="flex flex-wrap justify-end gap-1">
              <span
                v-if="day.mood"
                class="text-xs font-semibold bg-surface-2 px-2 py-1 rounded-full whitespace-nowrap"
              >{{ day.mood }}</span>
              <span
                v-for="(duration, i) in day.durations"
                :key="i"
                class="text-xs font-semibold text-primary-bright bg-primary/10 px-2 py-1 rounded-full whitespace-nowrap"
              >{{ duration }}</span>
            </div>
          </div>
          <div class="text-xs text-foreground-muted">{{ day.label }}</div>
          <p v-if="day.note" class="text-xs text-foreground-muted mt-1 italic">{{ day.note }}</p>
        </div>
        <div class="space-y-3">
          <div v-for="exercise in day.exercises" :key="exercise.name">
            <div class="text-sm font-medium text-foreground mb-1">{{ exercise.name }}</div>
            <div class="flex flex-wrap gap-2">
              <div
                v-for="set in exercise.sets"
                :key="set.id"
                class="text-xs px-2 py-1 rounded-lg bg-surface-2 text-foreground-subtle"
              >{{ formattedSet(set) }}</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
