<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import {
  getRoutineById,
  getExerciseById,
  getLastWorkoutBestSetForExercise,
  logSet,
  updateSet,
  formatWeight,
  logWorkoutSession,
  type Exercise,
  type WeightUnit,
} from '../../shared/db';
import { settings } from '../../shared/store';
import type { NavParams, ScreenName, SetRowState } from '../../shared/types';
import SetRow from './SetRow.vue';

const REST_SECONDS = 90;

// Deliberately not a strict 1-or-2-length tuple — the block-building loop in
// loadWorkout() constructs these dynamically and enforcing a tuple type
// there would add generic-narrowing ceremony for no real safety gain; the
// 1-or-2 invariant stays enforced by the template's v-if on .length, same
// as today.
interface WorkoutBlock {
  exercises: Exercise[];
}

function todayString() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Weight is optional (bodyweight/banded exercises), so a 0 weight is a
// normal, common case — showing "0 lbs x 12" would read like a mistake, so
// the weight portion is omitted entirely when there's none logged.
function formatGhostText(weightInLbs: number, unit: WeightUnit, reps: number) {
  if (!weightInLbs) return `${reps} reps`;
  return `${formatWeight(weightInLbs, unit)} ${unit} x ${reps}`;
}

function makeEmptyRow(): SetRowState {
  return reactive({
    weightEntered: '',
    reps: '',
    unit: settings.preferredUnit,
    bandColors: [],
    checked: false,
    weightInvalid: false,
    repsInvalid: false,
    loggedSetId: null,
  });
}

const props = defineProps<{
  navParams?: NavParams;
}>();
const emit = defineEmits<{
  navigate: [screen: ScreenName, params?: NavParams];
}>();

// Read once — navParams doesn't change over this screen's lifetime.
// Threaded through to logSet so history can be grouped by routine.
const routineId = props.navParams?.routineId || null;

// Captured the moment this screen is entered (a workout "starting"), held
// in memory only until Finish Workout writes it out as a session. Lost if
// the tab is backgrounded/reclaimed mid-workout — accepted for v1, see
// docs/edd-workout-duration.md.
const startedAt = routineId ? Date.now() : null;

// Identifies this one workout instance. Tagged onto every set logged
// during this screen's lifetime and reused as the workouts row's id on
// Finish, so history can group this session's sets together instead of
// merging them with any other same-day session of the same routine.
const sessionId = routineId ? crypto.randomUUID() : null;

const blocks = ref<WorkoutBlock[]>([]);
const ghostTextByExercise: Record<string, string | null> = reactive({});
const setRowsByExercise: Record<string, SetRowState[]> = reactive({});

const restBannerVisible = ref(false);
const restBannerSecondsLeft = ref(REST_SECONDS);
let restInterval: ReturnType<typeof setInterval> | null = null;

async function loadWorkout() {
  if (!routineId) return;
  const routine = await getRoutineById(routineId);
  if (!routine) return;

  const exercises: Exercise[] = [];
  for (const id of routine.exerciseIds) {
    const exercise = await getExerciseById(id);
    if (exercise) exercises.push(exercise);
  }

  // Populate every exercise's row array and ghost text *before* exposing
  // blocks to the template. pairedRows() reads straight from
  // setRowsByExercise for both sides of a superset without a null-check,
  // so blocks must never become visible while a partner's rows haven't
  // been seeded yet — otherwise a render could land in that gap (this
  // loop awaits getLastWorkoutBestSetForExercise per exercise) and throw.
  for (const exercise of exercises) {
    setRowsByExercise[exercise.id] = reactive([makeEmptyRow()]);
    const lastSet = await getLastWorkoutBestSetForExercise(exercise.id, sessionId);
    ghostTextByExercise[exercise.id] = lastSet ? formatGhostText(lastSet.weightInLbs, lastSet.unit, lastSet.reps) : null;
  }

  const seen = new Set<string>();
  const builtBlocks: WorkoutBlock[] = [];
  for (const exercise of exercises) {
    if (seen.has(exercise.id)) continue;
    seen.add(exercise.id);
    const partner = exercise.supersetWith ? exercises.find((e) => e.id === exercise.supersetWith) : undefined;
    if (partner) {
      seen.add(partner.id);
      builtBlocks.push({ exercises: [exercise, partner] });
    } else {
      builtBlocks.push({ exercises: [exercise] });
    }
  }
  blocks.value = builtBlocks;
}

onMounted(loadWorkout);
onUnmounted(() => {
  if (restInterval) clearInterval(restInterval);
});

function addRow(exerciseId: string) {
  setRowsByExercise[exerciseId].push(makeEmptyRow());
}

// Supersets always add a set to both exercises together, keeping their
// row arrays index-synced so "Set N" always pairs the right two rows.
function addSupersetRow(exerciseIdA: string, exerciseIdB: string) {
  setRowsByExercise[exerciseIdA].push(makeEmptyRow());
  setRowsByExercise[exerciseIdB].push(makeEmptyRow());
}

function getRow(exerciseId: string, index: number): SetRowState | undefined {
  const rows = setRowsByExercise[exerciseId];
  return rows ? rows[index] : undefined;
}

// Zips a superset pair's two row arrays into { index, rowA, rowB } tuples
// so the template can render Set 1 of A immediately above Set 1 of B,
// then Set 2 of A above Set 2 of B, etc. rowA/rowB are references to the
// same reactive row objects the arrays hold, so v-model bindings on them
// still mutate the real state.
function pairedRows(block: WorkoutBlock): { index: number; rowA: SetRowState; rowB: SetRowState }[] {
  const [exerciseA, exerciseB] = block.exercises;
  const rowsA = setRowsByExercise[exerciseA.id];
  if (!rowsA) return [];
  return rowsA
    .map((rowA, index) => ({ index, rowA, rowB: getRow(exerciseB.id, index) }))
    .filter((pair): pair is { index: number; rowA: SetRowState; rowB: SetRowState } => Boolean(pair.rowB));
}

function toggleUnit(row: SetRowState) {
  row.unit = row.unit === 'lbs' ? 'kg' : 'lbs';
}

function startRestBanner() {
  if (restInterval) clearInterval(restInterval);
  restBannerSecondsLeft.value = REST_SECONDS;
  restBannerVisible.value = true;
  restInterval = setInterval(() => {
    restBannerSecondsLeft.value -= 1;
    if (restBannerSecondsLeft.value <= 0) {
      if (restInterval) clearInterval(restInterval);
      restInterval = null;
      restBannerVisible.value = false;
    }
  }, 1000);
}

function dismissRestBanner() {
  if (restInterval) clearInterval(restInterval);
  restInterval = null;
  restBannerVisible.value = false;
}

// partnerRow is only passed for superset rows. The rest banner should
// fire once per superset pair, after whichever exercise is checked off
// last — not after each individual component set — so it only starts
// here when there's no partner (standalone exercise) or the partner's
// matching row is already checked. Only fires on a first-time log, not
// when re-saving an edit made after unlockRow.
async function checkRow(exerciseId: string, row: SetRowState, partnerRow: SetRowState | null = null) {
  if (row.checked) return;
  // Weight is optional — bodyweight/banded exercises (scapular wall
  // slides, banded rows, etc.) have nothing to enter there. Reps is the
  // only field that's always required.
  const weightText = row.weightEntered.trim();
  const weightEntered = weightText === '' ? 0 : parseFloat(weightText);
  const reps = parseInt(row.reps, 10);
  row.weightInvalid = Number.isNaN(weightEntered);
  row.repsInvalid = Number.isNaN(reps);
  if (row.weightInvalid || row.repsInvalid) return;

  // A row already carrying a loggedSetId was unlocked for editing, not
  // logged for the first time — update the existing set in place rather
  // than creating a duplicate, which would also churn its id/createdAt
  // and reshuffle history ordering.
  const isEdit = Boolean(row.loggedSetId);
  // Spread — row is deeply reactive, so row.bandColors is a Proxy-wrapped
  // array. IndexedDB structured-clones everything Dexie writes, and it
  // can't clone a Proxy; a plain array copy is required at the DB boundary.
  const bandColors = [...row.bandColors];
  if (isEdit) {
    await updateSet(row.loggedSetId!, { reps, weightEntered, unit: row.unit, bandColors });
  } else {
    const set = await logSet({
      exerciseId,
      date: todayString(),
      reps,
      weightEntered,
      unit: row.unit,
      routineId,
      sessionId,
      bandColors,
    });
    row.loggedSetId = set.id;
  }
  row.checked = true;
  // Ghost text is deliberately left untouched here — it always reflects
  // the prior workout's best set (set once in loadWorkout), never what's
  // being logged in this session, so set 2 never shows set 1's own data.

  if (!isEdit && (!partnerRow || partnerRow.checked)) {
    startRestBanner();
  }
}

// Re-opens an already-logged row for editing. Doesn't touch the
// database — the existing set stays as-is until the next reps change
// re-saves it via checkRow's update path above.
function unlockRow(row: SetRowState) {
  row.checked = false;
}

function viewHistory(exerciseId: string) {
  emit('navigate', 'progress-chart', { initialExerciseId: exerciseId });
}

// The only path that records a session duration — the header back-arrow
// still just navigates away with no write, since leaving mid-workout
// isn't "finishing" it.
// finishing guards against a second tap landing before the first async
// write + navigation completes (no loading state on the button, so a
// double-tap or a device double-firing the click event would otherwise
// write duplicate session rows).
const finishing = ref(false);
async function finishWorkout() {
  if (finishing.value) return;
  finishing.value = true;
  if (routineId && startedAt) {
    await logWorkoutSession({ id: sessionId!, routineId, date: todayString(), startedAt, endedAt: Date.now() });
  }
  emit('navigate', 'dashboard');
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 pb-32">
    <header class="flex items-center gap-3 px-4 py-5 sticky top-0 bg-slate-950/95 backdrop-blur border-b border-slate-800 z-10">
      <button @click="emit('navigate', 'dashboard')" aria-label="Back" class="w-11 h-11 flex items-center justify-center rounded-full bg-slate-800 active:bg-slate-700">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class="text-lg font-bold">Workout</h1>
    </header>

    <main class="px-4 py-4 space-y-6">
      <div v-for="block in blocks" :key="block.exercises[0].id">
        <!-- Standalone exercise -->
        <div v-if="block.exercises.length === 1" class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div class="flex items-center justify-between mb-1">
            <h2 class="font-semibold text-base">{{ block.exercises[0].name }}</h2>
            <button @click="viewHistory(block.exercises[0].id)" class="px-3 py-2 rounded-lg bg-slate-800 text-xs font-semibold text-emerald-400 active:bg-slate-700">History</button>
          </div>
          <div class="text-sm text-slate-400 mb-3">
            <span v-if="ghostTextByExercise[block.exercises[0].id]">Last: [{{ ghostTextByExercise[block.exercises[0].id] }}]</span>
            <span v-else>No history yet</span>
          </div>

          <div class="space-y-2">
            <SetRow
              v-for="(row, index) in setRowsByExercise[block.exercises[0].id]"
              :key="index"
              :row="row"
              :index="index"
              :resistance-type="block.exercises[0].resistanceType || 'weight'"
              @toggle-unit="toggleUnit(row)"
              @check="checkRow(block.exercises[0].id, row)"
              @unlock="unlockRow(row)"
            />
          </div>

          <button @click="addRow(block.exercises[0].id)" class="mt-3 w-full py-2.5 rounded-lg bg-slate-800 text-sm font-semibold text-emerald-400 active:bg-slate-700">+ Add set</button>
        </div>

        <!-- Superset pair: one high-contrast bounding box, sets interleaved A1/B1/A2/B2/... -->
        <div v-else class="bg-slate-900 border-2 border-emerald-600 rounded-2xl p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="font-semibold text-base">{{ block.exercises[0].name }} + {{ block.exercises[1].name }}</h2>
            <span class="text-xs uppercase tracking-wide text-emerald-400 font-semibold flex-shrink-0">Superset</span>
          </div>

          <div class="space-y-3 text-xs text-slate-400 mb-4">
            <div v-for="exercise in block.exercises" :key="exercise.id" class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="text-slate-300 font-medium text-sm">{{ exercise.name }}</div>
                <span v-if="ghostTextByExercise[exercise.id]">Last: [{{ ghostTextByExercise[exercise.id] }}]</span>
                <span v-else>No history yet</span>
              </div>
              <button @click="viewHistory(exercise.id)" class="px-2 py-1.5 rounded-lg bg-slate-800 text-xs font-semibold text-emerald-400 active:bg-slate-700 flex-shrink-0">History</button>
            </div>
          </div>

          <div class="space-y-3">
            <div v-for="pair in pairedRows(block)" :key="pair.index" class="rounded-xl bg-slate-800/60 p-2 space-y-2">
              <div class="text-xs text-slate-500 px-1">Set {{ pair.index + 1 }}</div>

              <div>
                <div class="text-xs text-slate-400 mb-1">{{ block.exercises[0].name }}</div>
                <SetRow
                  :row="pair.rowA"
                  compact
                  :resistance-type="block.exercises[0].resistanceType || 'weight'"
                  @toggle-unit="toggleUnit(pair.rowA)"
                  @check="checkRow(block.exercises[0].id, pair.rowA, pair.rowB)"
                  @unlock="unlockRow(pair.rowA)"
                />
              </div>

              <div>
                <div class="text-xs text-slate-400 mb-1">{{ block.exercises[1].name }}</div>
                <SetRow
                  :row="pair.rowB"
                  compact
                  :resistance-type="block.exercises[1].resistanceType || 'weight'"
                  @toggle-unit="toggleUnit(pair.rowB)"
                  @check="checkRow(block.exercises[1].id, pair.rowB, pair.rowA)"
                  @unlock="unlockRow(pair.rowB)"
                />
              </div>
            </div>
          </div>

          <button @click="addSupersetRow(block.exercises[0].id, block.exercises[1].id)" class="mt-3 w-full py-2.5 rounded-lg bg-slate-800 text-sm font-semibold text-emerald-400 active:bg-slate-700">+ Add set</button>
        </div>
      </div>
    </main>

    <div class="px-4">
      <button
        @click="finishWorkout"
        :disabled="finishing"
        class="w-full py-4 rounded-xl bg-emerald-500 text-slate-950 font-semibold text-base active:bg-emerald-400 disabled:opacity-60"
      >
        Finish Workout
      </button>
    </div>

    <div
      v-if="restBannerVisible"
      class="fixed inset-x-0 bottom-0 bg-emerald-600 text-slate-950 px-4 py-4 flex items-center justify-between font-semibold"
    >
      <span>Rest: {{ restBannerSecondsLeft }}s</span>
      <button @click="dismissRestBanner" class="px-4 py-2 rounded-lg bg-slate-950/25 active:bg-slate-950/40">Skip</button>
    </div>
  </div>
</template>
