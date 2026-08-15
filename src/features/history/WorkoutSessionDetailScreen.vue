<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  getWorkoutSessionById,
  getSetsForSession,
  getSetsForLegacySession,
  getAllExercises,
  getAllRoutines,
  formatWeight,
  type Exercise,
  type ResistanceType,
  type SetEntry,
} from '../../shared/db';
import { settings } from '../../shared/store';
import { formatDate, formatDuration } from '../../shared/dateFormat';
import ScreenHeader from '../../shared/components/ScreenHeader.vue';
import EmptyState from '../../shared/components/EmptyState.vue';
import type { NavParams, ScreenName } from '../../shared/types';

const props = defineProps<{
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

const loading = ref(true);
const routineName = ref<string | null>(null);
const dateLabel = ref('');
const durationLabel = ref<string | null>(null);
const mood = ref<string | undefined>();
const note = ref<string | undefined>();
const exercises = ref<ExerciseGroup[]>([]);

function formattedSet(set: SetEntry) {
  const weight = formatWeight(set.weightInLbs, settings.preferredUnit);
  return set.weightInLbs ? `${weight} ${settings.preferredUnit} x ${set.reps}` : `${set.reps} reps`;
}

function groupByExercise(sets: SetEntry[], exerciseById: Map<string, Exercise>): ExerciseGroup[] {
  const byExercise = new Map<string, SetEntry[]>();
  for (const set of sets) {
    if (!byExercise.has(set.exerciseId)) byExercise.set(set.exerciseId, []);
    byExercise.get(set.exerciseId)!.push(set);
  }
  return [...byExercise.entries()].map(([exerciseId, exerciseSets]) => ({
    name: exerciseById.get(exerciseId)?.name || 'Unknown exercise',
    resistanceType: exerciseById.get(exerciseId)?.resistanceType || 'weight',
    sets: exerciseSets,
  }));
}

onMounted(async () => {
  const [exerciseList, routines] = await Promise.all([getAllExercises(), getAllRoutines()]);
  const exerciseById = new Map(exerciseList.map((e) => [e.id, e]));
  const routineById = new Map(routines.map((r) => [r.id, r]));

  const sessionId = props.navParams?.sessionId;
  const sessionDate = props.navParams?.sessionDate;

  if (sessionId) {
    const [session, sets] = await Promise.all([getWorkoutSessionById(sessionId), getSetsForSession(sessionId)]);
    if (session) {
      routineName.value = routineById.get(session.routineId)?.name || null;
      dateLabel.value = formatDate(session.date);
      durationLabel.value = formatDuration(session.durationMs);
      mood.value = session.mood;
      note.value = session.note;
    }
    exercises.value = groupByExercise(sets, exerciseById);
  } else if (sessionDate) {
    const routineId = props.navParams?.routineId ?? null;
    const sets = await getSetsForLegacySession(sessionDate, routineId);
    routineName.value = (routineId && routineById.get(routineId)?.name) || null;
    dateLabel.value = formatDate(sessionDate);
    exercises.value = groupByExercise(sets, exerciseById);
  }

  loading.value = false;
});
</script>

<template>
  <div class="min-h-screen bg-background text-foreground pb-10">
    <ScreenHeader :title="routineName || 'Workout'" @back="emit('navigate', 'workout-history')" />

    <main class="px-4 py-4 space-y-4">
      <div v-if="!loading">
        <div class="mb-1 flex items-start justify-between gap-2">
          <div class="text-base text-foreground-muted">{{ dateLabel }}</div>
          <div class="flex flex-wrap justify-end gap-1">
            <span
              v-if="mood"
              class="text-xs font-semibold bg-surface-2 px-2 py-1 rounded-full whitespace-nowrap"
            >{{ mood }}</span>
            <span
              v-if="durationLabel"
              class="text-xs font-semibold text-primary-bright bg-primary/10 px-2 py-1 rounded-full whitespace-nowrap"
            >{{ durationLabel }}</span>
          </div>
        </div>
        <p v-if="note" class="text-sm text-foreground-muted italic mb-3">{{ note }}</p>

        <EmptyState v-if="exercises.length === 0">No sets logged for this workout.</EmptyState>

        <div v-else class="space-y-4">
          <div v-for="exercise in exercises" :key="exercise.name">
            <div class="text-lg font-semibold text-foreground mb-1">{{ exercise.name }}</div>
            <ul class="space-y-1">
              <li
                v-for="set in exercise.sets"
                :key="set.id"
                class="text-base text-foreground-subtle bg-surface-2 rounded-lg px-3 py-2"
              >{{ formattedSet(set) }}</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
