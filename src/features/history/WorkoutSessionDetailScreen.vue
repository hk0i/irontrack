<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  getWorkoutSessionById,
  getSetsForSession,
  getSetsForLegacySession,
  getAllExercises,
  getAllRoutines,
  getPreviousBestSetForExercise,
  getPersonalBestsForExercise,
  getRecentSessionVolumesForRoutine,
  updateSet,
  deleteSet,
  formatWeight,
  type Exercise,
  type ExercisePersonalBests,
  type ResistanceType,
  type SetEntry,
  type SessionVolumePoint,
  type WeightUnit,
} from '../../shared/db';
import { settings } from '../../shared/store';
import { confirmThenDelete } from '../../shared/confirm';
import { formatDate, formatDuration } from '../../shared/dateFormat';
import { useTrendChart } from '../../shared/composables/useTrendChart';
import ScreenHeader from '../../shared/components/ScreenHeader.vue';
import IconButton from '../../shared/components/IconButton.vue';
import EmptyState from '../../shared/components/EmptyState.vue';
import BandColorPicker from '../../shared/components/BandColorPicker.vue';
import StatBadge from '../../shared/components/StatBadge.vue';

const route = useRoute();

/**
 * Transient inline-edit fields bolted onto a real SetEntry, never persisted
 * as-is — startEdit()/cancelEdit() add/remove them on the object in place.
 */
type EditableSet = SetEntry & {
  _editWeight?: string;
  _editReps?: string;
  _editUnit?: WeightUnit;
  _editBandColors?: string[];
};

interface ExerciseGroup {
  exerciseId: string;
  name: string;
  /**
   * Determines which fields the inline edit form shows — mirrors
   * SetRow.vue's own resistanceType branching (weight+unit / band chips /
   * reps-only), so editing a historical bodyweight or band-resistance set
   * no longer shows an irrelevant weight field or loses band-color edits.
   */
  resistanceType: ResistanceType;
  sets: EditableSet[];
  /** Heaviest set from the previous time this exercise was performed
   *  (strictly before this session's date), or null if never done before. */
  previousBest: SetEntry | null;
  /** Full-history max weight/reps for this exercise, used to flag any set
   *  in this session that ties or beats it as an all-time PR. */
  personalBests: ExercisePersonalBests | null;
}

const loading = ref(true);
const routineName = ref<string | null>(null);
const dateLabel = ref('');
const durationLabel = ref<string | null>(null);
const mood = ref<string | undefined>();
const note = ref<string | undefined>();
const exercises = ref<ExerciseGroup[]>([]);
const editingId = ref<string | null>(null);
const volumeHistory = ref<SessionVolumePoint[]>([]);

const VOLUME_CHART_WIDTH = 280;
const VOLUME_CHART_HEIGHT = 48;
const { points: volumePoints, polylinePoints: volumePolyline } = useTrendChart(
  volumeHistory,
  (p) => p.volume,
  { width: VOLUME_CHART_WIDTH, height: VOLUME_CHART_HEIGHT, padding: 6 },
);

function formattedSet(set: SetEntry) {
  const weight = formatWeight(set.weightInLbs, settings.preferredUnit);
  return set.weightInLbs ? `${weight} ${settings.preferredUnit} x ${set.reps}` : `${set.reps} reps`;
}

function groupByExercise(sets: EditableSet[], exerciseById: Map<string, Exercise>): ExerciseGroup[] {
  const byExercise = new Map<string, EditableSet[]>();
  for (const set of sets) {
    if (!byExercise.has(set.exerciseId)) byExercise.set(set.exerciseId, []);
    byExercise.get(set.exerciseId)!.push(set);
  }
  return [...byExercise.entries()].map(([exerciseId, exerciseSets]) => ({
    exerciseId,
    name: exerciseById.get(exerciseId)?.name || 'Unknown exercise',
    resistanceType: exerciseById.get(exerciseId)?.resistanceType || 'weight',
    sets: exerciseSets,
    previousBest: null,
    personalBests: null,
  }));
}

function bestSet(sets: SetEntry[]): SetEntry {
  return sets.reduce((best, s) => (s.weightInLbs > best.weightInLbs || (s.weightInLbs === best.weightInLbs && s.reps > best.reps) ? s : best));
}

/** "+10 lbs vs last time (185 → 195)" / reps-only for non-weight exercises / "No previous data". */
function progressionText(exercise: ExerciseGroup): string {
  if (!exercise.previousBest) return 'No previous data';
  const current = bestSet(exercise.sets);
  const previous = exercise.previousBest;
  if (exercise.resistanceType !== 'weight') {
    const repsDelta = current.reps - previous.reps;
    const sign = repsDelta > 0 ? '+' : '';
    return `${sign}${repsDelta} reps vs last time (${previous.reps} → ${current.reps})`;
  }
  const currentWeight = formatWeight(current.weightInLbs, settings.preferredUnit);
  const previousWeight = formatWeight(previous.weightInLbs, settings.preferredUnit);
  const weightDelta = Math.round((currentWeight - previousWeight) * 10) / 10;
  const sign = weightDelta > 0 ? '+' : '';
  return `${sign}${weightDelta} ${settings.preferredUnit} vs last time (${previousWeight} → ${currentWeight} ${settings.preferredUnit})`;
}

/** All-time PR labels for one set, checked against its exercise's full
 *  history — shows even on an exercise's very first logged set, since a
 *  first set is trivially both the heaviest-ever and most-reps-ever. */
function prBadges(set: SetEntry, exercise: ExerciseGroup): string[] {
  if (!exercise.personalBests) return [];
  const badges: string[] = [];
  if (set.weightInLbs > 0 && set.weightInLbs === exercise.personalBests.maxWeightInLbs) badges.push('Heaviest ever');
  if (set.reps === exercise.personalBests.maxReps) badges.push('Most reps ever');
  return badges;
}

const sessionHighlights = computed(() => {
  const allSets = exercises.value.flatMap((exercise) => exercise.sets.map((set) => ({ set, exercise })));
  if (allSets.length === 0) return null;
  const heaviest = allSets.reduce((best, s) => (s.set.weightInLbs > best.set.weightInLbs ? s : best));
  const mostReps = allSets.reduce((best, s) => (s.set.reps > best.set.reps ? s : best));
  return {
    heaviest: heaviest.set.weightInLbs > 0
      ? `${heaviest.exercise.name}: ${formatWeight(heaviest.set.weightInLbs, settings.preferredUnit)} ${settings.preferredUnit}`
      : null,
    mostReps: `${mostReps.exercise.name}: ${mostReps.set.reps} reps`,
  };
});

/**
 * Edits happen inline against a copy of the values (set._editWeight etc.)
 * so the read-only pill doesn't change mid-edit — only Save persists and
 * updates the real fields, matching the weight-optional/reps-required
 * rule the active workout screen uses.
 */
function startEdit(set: EditableSet) {
  set._editWeight = String(set.weightEntered);
  set._editReps = String(set.reps);
  set._editUnit = set.unit;
  set._editBandColors = set.bandColors ? [...set.bandColors] : [];
  editingId.value = set.id;
}

function cancelEdit(set: EditableSet) {
  delete set._editWeight;
  delete set._editReps;
  delete set._editUnit;
  delete set._editBandColors;
  editingId.value = null;
}

function toggleEditUnit(set: EditableSet) {
  set._editUnit = set._editUnit === 'lbs' ? 'kg' : 'lbs';
}

function editIsValid(set: EditableSet) {
  const weightText = (set._editWeight || '').trim();
  const weightEntered = weightText === '' ? 0 : parseFloat(weightText);
  const reps = parseInt(set._editReps || '', 10);
  return !Number.isNaN(weightEntered) && !Number.isNaN(reps);
}

async function saveEdit(exercise: ExerciseGroup, set: EditableSet) {
  if (!editIsValid(set)) return;
  const weightText = (set._editWeight || '').trim();
  const weightEntered = weightText === '' ? 0 : parseFloat(weightText);
  const reps = parseInt(set._editReps || '', 10);
  const unit = set._editUnit!;
  // Only band-resistance exercises actually edit bandColors — passing it
  // for the other two types would blow away band data that was never
  // shown/editable in their form, even though none should exist there.
  const bandColors = exercise.resistanceType === 'bands' ? [...(set._editBandColors || [])] : undefined;
  const { weightInLbs } = await updateSet(set.id, { reps, weightEntered, unit, bandColors });
  set.reps = reps;
  set.weightEntered = weightEntered;
  set.unit = unit;
  set.weightInLbs = weightInLbs;
  if (bandColors) set.bandColors = bandColors;
  delete set._editWeight;
  delete set._editReps;
  delete set._editUnit;
  delete set._editBandColors;
  editingId.value = null;
}

/**
 * Prunes empty exercise groups after a delete so the screen never shows a
 * leftover heading with nothing under it. If every exercise empties out,
 * the EmptyState below takes over — the header's back button remains the
 * way out.
 */
async function deleteEntry(exercise: ExerciseGroup, set: EditableSet) {
  await confirmThenDelete('Delete this set? This cannot be undone.', async () => {
    await deleteSet(set.id);
    exercise.sets = exercise.sets.filter((s) => s.id !== set.id);
    if (exercise.sets.length === 0) {
      exercises.value = exercises.value.filter((e) => e !== exercise);
    }
  });
}

onMounted(async () => {
  const [exerciseList, routines] = await Promise.all([getAllExercises(), getAllRoutines()]);
  const exerciseById = new Map(exerciseList.map((e) => [e.id, e]));
  const routineById = new Map(routines.map((r) => [r.id, r]));

  const sessionId = route.params.sessionId as string | undefined;
  const sessionDate = route.params.sessionDate as string | undefined;

  let rawDate: string | null = null;
  let rawRoutineId: string | null = null;

  if (sessionId) {
    const [session, sets] = await Promise.all([getWorkoutSessionById(sessionId), getSetsForSession(sessionId)]);
    if (session) {
      routineName.value = routineById.get(session.routineId)?.name || null;
      dateLabel.value = formatDate(session.date);
      durationLabel.value = formatDuration(session.durationMs);
      mood.value = session.mood;
      note.value = session.note;
      rawDate = session.date;
      rawRoutineId = session.routineId;
    }
    exercises.value = groupByExercise(sets, exerciseById);
  } else if (sessionDate) {
    const routineIdParam = route.params.routineId as string | undefined;
    const routineId = routineIdParam && routineIdParam !== 'none' ? routineIdParam : null;
    const sets = await getSetsForLegacySession(sessionDate, routineId);
    routineName.value = (routineId && routineById.get(routineId)?.name) || null;
    dateLabel.value = formatDate(sessionDate);
    exercises.value = groupByExercise(sets, exerciseById);
    rawDate = sessionDate;
    rawRoutineId = routineId;
  }

  if (rawDate) {
    const date = rawDate;
    await Promise.all(
      exercises.value.map(async (exercise) => {
        const [previousBest, personalBests] = await Promise.all([
          getPreviousBestSetForExercise(exercise.exerciseId, date),
          getPersonalBestsForExercise(exercise.exerciseId),
        ]);
        exercise.previousBest = previousBest;
        exercise.personalBests = personalBests;
      }),
    );
  }

  if (rawDate && rawRoutineId) {
    volumeHistory.value = await getRecentSessionVolumesForRoutine(rawRoutineId, rawDate);
  }

  loading.value = false;
});
</script>

<template>
  <div class="min-h-screen bg-background text-foreground pb-10">
    <ScreenHeader :title="routineName || 'Workout'" :fallback="{ name: 'workout-history' }" />

    <main class="px-4 py-4 space-y-4">
      <div v-if="!loading">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-primary-bright" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6.5 6.5l11 11M4 8l3-3M20 16l-3 3M2 10l3 3M19 5l3 3M6 20l3-3M14.5 4.5a3 3 0 114 4l-10 10a3 3 0 11-4-4l10-10z" />
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-foreground leading-tight">{{ routineName || 'Workout' }}</h1>
        </div>

        <div v-if="volumePoints.length > 1" class="mb-4 bg-surface border border-border rounded-2xl p-3">
          <div class="text-xs font-semibold text-foreground-muted uppercase tracking-wide mb-1">Volume trend</div>
          <svg :viewBox="`0 0 ${VOLUME_CHART_WIDTH} ${VOLUME_CHART_HEIGHT}`" class="w-full h-12">
            <polyline :points="volumePolyline" fill="none" stroke="var(--color-primary)" stroke-width="2" />
            <circle
              v-for="(p, i) in volumePoints"
              :key="i"
              :cx="p.x"
              :cy="p.y"
              :r="i === volumePoints.length - 1 ? 4 : 2.5"
              :fill="i === volumePoints.length - 1 ? 'var(--color-primary-bright)' : 'var(--color-primary)'"
            />
          </svg>
        </div>

        <div class="mb-1 flex items-start justify-between gap-2">
          <div class="text-base text-foreground-muted">{{ dateLabel }}</div>
          <div class="flex flex-wrap justify-end gap-1.5">
            <span
              v-if="mood"
              class="text-base font-semibold bg-surface-2 px-3 py-1.5 rounded-full whitespace-nowrap"
            >{{ mood }}</span>
            <span
              v-if="durationLabel"
              class="text-sm font-semibold text-primary-bright bg-primary/10 px-3 py-1.5 rounded-full whitespace-nowrap"
            >{{ durationLabel }}</span>
          </div>
        </div>
        <p v-if="note" class="text-sm text-foreground-muted italic mb-3">{{ note }}</p>

        <div v-if="sessionHighlights && (sessionHighlights.heaviest || sessionHighlights.mostReps)" class="flex flex-wrap gap-1.5 mb-4">
          <StatBadge v-if="sessionHighlights.heaviest" :label="`Heaviest: ${sessionHighlights.heaviest}`" tone="pr" />
          <StatBadge v-if="sessionHighlights.mostReps" :label="`Most reps: ${sessionHighlights.mostReps}`" tone="pr" />
        </div>

        <EmptyState v-if="exercises.length === 0">No sets logged for this workout.</EmptyState>

        <div v-else class="space-y-4">
          <div v-for="exercise in exercises" :key="exercise.name" class="bg-surface border border-border rounded-2xl p-4">
            <div class="text-xl font-bold text-foreground mb-1">{{ exercise.name }}</div>
            <div class="text-sm text-foreground-muted mb-3">{{ progressionText(exercise) }}</div>
            <div class="flex flex-col gap-2">
              <div v-for="set in exercise.sets" :key="set.id">
                <div
                  v-if="editingId !== set.id"
                  class="w-full flex items-center justify-between gap-2 text-lg pl-4 pr-1.5 py-3 rounded-xl bg-surface-2 text-foreground"
                >
                  <div class="flex items-center gap-2 flex-wrap">
                    <span>{{ formattedSet(set) }}</span>
                    <StatBadge v-for="badge in prBadges(set, exercise)" :key="badge" :label="badge" tone="pr" />
                  </div>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <IconButton @click="startEdit(set)" aria-label="Edit set">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487a2.06 2.06 0 112.914 2.914L7.5 19.675l-4 1 1-4L16.862 4.487z" />
                      </svg>
                    </IconButton>
                    <IconButton @click="deleteEntry(exercise, set)" aria-label="Delete set" tone="danger">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-8 0l1 13a2 2 0 002 2h4a2 2 0 002-2l1-13" />
                      </svg>
                    </IconButton>
                  </div>
                </div>

                <div v-else class="flex items-center gap-1.5 bg-surface-2 rounded-xl p-2 flex-wrap">
                  <template v-if="exercise.resistanceType === 'weight'">
                    <input
                      v-model="set._editWeight"
                      inputmode="decimal"
                      type="text"
                      placeholder="Wt"
                      class="w-16 h-11 rounded-lg bg-surface border border-border-strong px-2 text-center"
                    />
                  </template>

                  <BandColorPicker
                    v-else-if="exercise.resistanceType === 'bands'"
                    :model-value="set._editBandColors || []"
                    @update:model-value="set._editBandColors = $event"
                    :show-reset="false"
                    variant="surface"
                    class="max-w-[180px]"
                  />

                  <input
                    v-model="set._editReps"
                    inputmode="numeric"
                    type="text"
                    placeholder="Reps"
                    class="w-14 h-11 rounded-lg bg-surface border border-border-strong px-2 text-center"
                  />
                  <button
                    v-if="exercise.resistanceType === 'weight'"
                    @click="toggleEditUnit(set)"
                    class="w-14 h-11 flex-shrink-0 rounded-full bg-surface border border-border-strong text-xs font-semibold uppercase"
                  >{{ set._editUnit }}</button>
                  <button
                    @click="saveEdit(exercise, set)"
                    :disabled="!editIsValid(set)"
                    aria-label="Save set"
                    class="w-11 h-11 flex-shrink-0 rounded-lg bg-primary text-on-primary flex items-center justify-center disabled:opacity-30"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button
                    @click="cancelEdit(set)"
                    aria-label="Cancel edit"
                    class="w-11 h-11 flex-shrink-0 rounded-lg bg-surface-3 text-foreground-subtle flex items-center justify-center text-lg"
                  >&times;</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
