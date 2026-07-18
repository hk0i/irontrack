<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  getAllSets,
  getAllExercises,
  getAllRoutines,
  getAllWorkoutSessions,
  updateSet,
  deleteSet,
  formatWeight,
  type SetEntry,
  type WeightUnit,
  type WorkoutSession,
} from '../../shared/db';
import { settings } from '../../shared/store';
import type { NavParams, ScreenName } from '../../shared/types';

defineProps<{
  navParams?: NavParams;
}>();
const emit = defineEmits<{
  navigate: [screen: ScreenName, params?: NavParams];
}>();

// Transient inline-edit fields bolted onto a real SetEntry, never persisted
// as-is — startEdit()/cancelEdit() add/remove them on the object in place.
type EditableSet = SetEntry & {
  _editWeight?: string;
  _editReps?: string;
  _editUnit?: WeightUnit;
};

interface ExerciseGroup {
  name: string;
  sets: EditableSet[];
}

interface DayGroup {
  key: string;
  date: string;
  label: string;
  routineName: string | null;
  durations: string[];
  exercises: ExerciseGroup[];
}

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// Rounds up to the nearest minute so a very short test/real session still
// reads as "1m" rather than a confusing "0m".
function formatDuration(ms: number) {
  const totalMinutes = Math.max(1, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

const days = ref<DayGroup[]>([]);
const editingId = ref<string | null>(null);

interface SessionAccumulator {
  date: string;
  routineId: string | null;
  sessionId: string | null;
  byExercise: Map<string, EditableSet[]>;
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
    if (session.sessionId) {
      const match = workoutById.get(session.sessionId);
      durations = match ? [formatDuration(match.durationMs)] : [];
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
      durations,
      exercises: [...session.byExercise.entries()].map(([exerciseId, exerciseSets]) => ({
        name: exerciseById.get(exerciseId)?.name || 'Unknown exercise',
        sets: exerciseSets,
      })),
    };
  });
});

function formattedSet(set: SetEntry) {
  const weight = formatWeight(set.weightInLbs, settings.preferredUnit);
  return set.weightInLbs ? `${weight} ${settings.preferredUnit} x ${set.reps}` : `${set.reps} reps`;
}

// Edits happen inline against a copy of the values (set._editWeight etc.)
// so the read-only pill doesn't change mid-edit — only Save persists and
// updates the real fields, matching the weight-optional/reps-required
// rule the active workout screen uses.
function startEdit(set: EditableSet) {
  set._editWeight = String(set.weightEntered);
  set._editReps = String(set.reps);
  set._editUnit = set.unit;
  editingId.value = set.id;
}

function cancelEdit(set: EditableSet) {
  delete set._editWeight;
  delete set._editReps;
  delete set._editUnit;
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

async function saveEdit(set: EditableSet) {
  if (!editIsValid(set)) return;
  const weightText = (set._editWeight || '').trim();
  const weightEntered = weightText === '' ? 0 : parseFloat(weightText);
  const reps = parseInt(set._editReps || '', 10);
  const unit = set._editUnit!;
  const { weightInLbs } = await updateSet(set.id, { reps, weightEntered, unit });
  set.reps = reps;
  set.weightEntered = weightEntered;
  set.unit = unit;
  set.weightInLbs = weightInLbs;
  delete set._editWeight;
  delete set._editReps;
  delete set._editUnit;
  editingId.value = null;
}

// Prunes empty exercise groups/days after a delete so the screen never
// shows a leftover heading with nothing under it.
async function deleteEntry(day: DayGroup, exercise: ExerciseGroup, set: EditableSet) {
  if (!confirm('Delete this set? This cannot be undone.')) return;
  await deleteSet(set.id);
  exercise.sets = exercise.sets.filter((s) => s.id !== set.id);
  if (exercise.sets.length === 0) {
    day.exercises = day.exercises.filter((e) => e !== exercise);
  }
  if (day.exercises.length === 0) {
    days.value = days.value.filter((d) => d !== day);
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 pb-10">
    <header class="flex items-center gap-3 px-4 py-5 sticky top-0 bg-slate-950/95 backdrop-blur border-b border-slate-800">
      <button @click="emit('navigate', 'dashboard')" aria-label="Back" class="w-11 h-11 flex items-center justify-center rounded-full bg-slate-800 active:bg-slate-700">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class="text-lg font-bold">Workout History</h1>
    </header>

    <main class="px-4 py-4 space-y-4">
      <div v-if="days.length === 0" class="text-slate-400 text-center mt-16">
        No workouts logged yet.
      </div>

      <div
        v-for="day in days"
        :key="day.key"
        class="bg-slate-900 border border-slate-800 rounded-2xl p-4"
      >
        <div class="mb-3">
          <div class="flex items-start justify-between gap-2">
            <h2 class="font-semibold text-base">{{ day.routineName || 'Workout' }}</h2>
            <div v-if="day.durations.length" class="flex flex-wrap justify-end gap-1">
              <span
                v-for="(duration, i) in day.durations"
                :key="i"
                class="text-xs font-semibold text-emerald-400 bg-emerald-950/40 px-2 py-1 rounded-full whitespace-nowrap"
              >{{ duration }}</span>
            </div>
          </div>
          <div class="text-xs text-slate-400">{{ day.label }}</div>
        </div>
        <div class="space-y-3">
          <div v-for="exercise in day.exercises" :key="exercise.name">
            <div class="text-sm font-medium text-slate-200 mb-1">{{ exercise.name }}</div>
            <div class="flex flex-wrap gap-2">
              <div v-for="set in exercise.sets" :key="set.id">
                <div
                  v-if="editingId !== set.id"
                  class="flex items-center gap-1 text-xs pl-2 pr-1 py-1 rounded-lg bg-slate-800 text-slate-300"
                >
                  <span>{{ formattedSet(set) }}</span>
                  <button
                    @click="startEdit(set)"
                    :aria-label="'Edit set'"
                    class="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-md text-emerald-400 active:bg-slate-700"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487a2.06 2.06 0 112.914 2.914L7.5 19.675l-4 1 1-4L16.862 4.487z" />
                    </svg>
                  </button>
                  <button
                    @click="deleteEntry(day, exercise, set)"
                    aria-label="Delete set"
                    class="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-md text-rose-400 active:bg-slate-700"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-8 0l1 13a2 2 0 002 2h4a2 2 0 002-2l1-13" />
                    </svg>
                  </button>
                </div>

                <div v-else class="flex items-center gap-1.5 bg-slate-800 rounded-lg p-1.5">
                  <input
                    v-model="set._editWeight"
                    inputmode="decimal"
                    type="text"
                    placeholder="Wt"
                    class="w-16 h-11 rounded-lg bg-slate-900 border border-slate-700 px-2 text-center"
                  />
                  <input
                    v-model="set._editReps"
                    inputmode="numeric"
                    type="text"
                    placeholder="Reps"
                    class="w-14 h-11 rounded-lg bg-slate-900 border border-slate-700 px-2 text-center"
                  />
                  <button
                    @click="toggleEditUnit(set)"
                    class="w-14 h-11 flex-shrink-0 rounded-full bg-slate-900 border border-slate-700 text-xs font-semibold uppercase"
                  >{{ set._editUnit }}</button>
                  <button
                    @click="saveEdit(set)"
                    :disabled="!editIsValid(set)"
                    aria-label="Save set"
                    class="w-11 h-11 flex-shrink-0 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center disabled:opacity-30"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button
                    @click="cancelEdit(set)"
                    aria-label="Cancel edit"
                    class="w-11 h-11 flex-shrink-0 rounded-lg bg-slate-700 text-slate-300 flex items-center justify-center text-lg"
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
