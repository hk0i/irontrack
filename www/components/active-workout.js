import { getRoutineById, getExerciseById, getLastSetForExercise, logSet, formatWeight, kgToLbs } from '../db.js';
import { settings } from '../store.js';

const REST_SECONDS = 90;

function todayString() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Weight is optional (bodyweight/banded exercises), so a 0 weight is a
// normal, common case — showing "0 lbs x 12" would read like a mistake, so
// the weight portion is omitted entirely when there's none logged.
function formatGhostText(weightInLbs, unit, reps) {
  if (!weightInLbs) return `${reps} reps`;
  return `${formatWeight(weightInLbs, unit)} ${unit} x ${reps}`;
}

function makeEmptyRow() {
  return Vue.reactive({
    weightEntered: '',
    reps: '',
    unit: settings.preferredUnit,
    checked: false,
    weightInvalid: false,
    repsInvalid: false,
  });
}

export default {
  props: {
    navParams: { type: Object, default: () => ({}) },
  },
  emits: ['navigate'],
  setup(props, { emit }) {
    const { ref, reactive, onMounted, onUnmounted } = Vue;

    const blocks = ref([]); // [{ exercises: [ex] } | { exercises: [exA, exB] }]
    const ghostTextByExercise = reactive({});
    const setRowsByExercise = reactive({});

    const restBannerVisible = ref(false);
    const restBannerSecondsLeft = ref(REST_SECONDS);
    let restInterval = null;

    async function loadWorkout() {
      const routineId = props.navParams.routineId;
      if (!routineId) return;
      const routine = await getRoutineById(routineId);
      if (!routine) return;

      const exercises = [];
      for (const id of routine.exerciseIds) {
        exercises.push(await getExerciseById(id));
      }

      // Populate every exercise's row array and ghost text *before* exposing
      // blocks to the template. pairedRows() reads straight from
      // setRowsByExercise for both sides of a superset without a null-check,
      // so blocks must never become visible while a partner's rows haven't
      // been seeded yet — otherwise a render could land in that gap (this
      // loop awaits getLastSetForExercise per exercise) and throw.
      for (const exercise of exercises) {
        if (!exercise) continue;
        setRowsByExercise[exercise.id] = reactive([makeEmptyRow()]);
        const lastSet = await getLastSetForExercise(exercise.id);
        ghostTextByExercise[exercise.id] = lastSet ? formatGhostText(lastSet.weightInLbs, lastSet.unit, lastSet.reps) : null;
      }

      const seen = new Set();
      const builtBlocks = [];
      for (const exercise of exercises) {
        if (!exercise || seen.has(exercise.id)) continue;
        seen.add(exercise.id);
        if (exercise.supersetWith && exercises.some((e) => e && e.id === exercise.supersetWith)) {
          const partner = exercises.find((e) => e && e.id === exercise.supersetWith);
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

    function addRow(exerciseId) {
      setRowsByExercise[exerciseId].push(makeEmptyRow());
    }

    // Supersets always add a set to both exercises together, keeping their
    // row arrays index-synced so "Set N" always pairs the right two rows.
    function addSupersetRow(exerciseIdA, exerciseIdB) {
      setRowsByExercise[exerciseIdA].push(makeEmptyRow());
      setRowsByExercise[exerciseIdB].push(makeEmptyRow());
    }

    function getRow(exerciseId, index) {
      const rows = setRowsByExercise[exerciseId];
      return rows ? rows[index] : undefined;
    }

    // Zips a superset pair's two row arrays into { index, rowA, rowB } tuples
    // so the template can render Set 1 of A immediately above Set 1 of B,
    // then Set 2 of A above Set 2 of B, etc. rowA/rowB are references to the
    // same reactive row objects the arrays hold, so v-model bindings on them
    // still mutate the real state.
    function pairedRows(block) {
      const [exerciseA, exerciseB] = block.exercises;
      const rowsA = setRowsByExercise[exerciseA.id];
      if (!rowsA) return [];
      return rowsA
        .map((rowA, index) => ({ index, rowA, rowB: getRow(exerciseB.id, index) }))
        .filter((pair) => pair.rowB);
    }

    function toggleUnit(row) {
      row.unit = row.unit === 'lbs' ? 'kg' : 'lbs';
    }

    function startRestBanner() {
      if (restInterval) clearInterval(restInterval);
      restBannerSecondsLeft.value = REST_SECONDS;
      restBannerVisible.value = true;
      restInterval = setInterval(() => {
        restBannerSecondsLeft.value -= 1;
        if (restBannerSecondsLeft.value <= 0) {
          clearInterval(restInterval);
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
    // matching row is already checked.
    async function checkRow(exerciseId, row, partnerRow = null) {
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
      await logSet({
        exerciseId,
        date: todayString(),
        reps,
        weightEntered,
        unit: row.unit,
      });
      row.checked = true;
      const weightInLbs = row.unit === 'kg' ? kgToLbs(weightEntered) : weightEntered;
      ghostTextByExercise[exerciseId] = formatGhostText(weightInLbs, row.unit, reps);

      if (!partnerRow || partnerRow.checked) {
        startRestBanner();
      }
    }

    function viewHistory(exerciseId) {
      emit('navigate', 'progress-chart', { initialExerciseId: exerciseId });
    }

    return {
      blocks,
      ghostTextByExercise,
      setRowsByExercise,
      restBannerVisible,
      restBannerSecondsLeft,
      addRow,
      addSupersetRow,
      pairedRows,
      toggleUnit,
      checkRow,
      dismissRestBanner,
      viewHistory,
      emit,
    };
  },
  template: `
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
              <div
                v-for="(row, index) in setRowsByExercise[block.exercises[0].id]"
                :key="index"
                class="flex items-center gap-2"
              >
                <span class="w-5 text-sm text-slate-500 text-center">{{ index + 1 }}</span>
                <input
                  v-model="row.weightEntered"
                  @input="row.weightInvalid = false"
                  :disabled="row.checked"
                  inputmode="decimal"
                  type="text"
                  placeholder="Weight"
                  class="w-20 h-11 rounded-lg bg-slate-800 border px-2 text-center disabled:opacity-50"
                  :class="row.weightInvalid ? 'border-rose-500' : 'border-slate-700'"
                />
                <input
                  v-model="row.reps"
                  @input="row.repsInvalid = false"
                  :disabled="row.checked"
                  inputmode="numeric"
                  type="text"
                  placeholder="Reps"
                  class="w-16 h-11 rounded-lg bg-slate-800 border px-2 text-center disabled:opacity-50"
                  :class="row.repsInvalid ? 'border-rose-500' : 'border-slate-700'"
                />
                <button
                  @click="toggleUnit(row)"
                  :disabled="row.checked"
                  class="w-14 h-11 flex-shrink-0 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold uppercase disabled:opacity-50"
                >
                  {{ row.unit }}
                </button>
                <button
                  @click="checkRow(block.exercises[0].id, row)"
                  :aria-label="row.checked ? 'Set logged' : 'Log set'"
                  class="w-11 h-11 rounded-lg border-2 flex items-center justify-center flex-shrink-0"
                  :class="row.checked ? 'bg-emerald-500 border-emerald-500 text-slate-950' : 'border-slate-700'"
                >
                  <span v-if="row.checked">&#10003;</span>
                </button>
              </div>
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
                  <div class="flex items-center gap-1.5">
                    <input
                      v-model="pair.rowA.weightEntered"
                      @input="pair.rowA.weightInvalid = false"
                      :disabled="pair.rowA.checked"
                      inputmode="decimal"
                      type="text"
                      placeholder="Weight"
                      class="w-20 h-11 rounded-lg bg-slate-800 border px-2 text-center disabled:opacity-50"
                      :class="pair.rowA.weightInvalid ? 'border-rose-500' : 'border-slate-700'"
                    />
                    <input
                      v-model="pair.rowA.reps"
                      @input="pair.rowA.repsInvalid = false"
                      :disabled="pair.rowA.checked"
                      inputmode="numeric"
                      type="text"
                      placeholder="Reps"
                      class="w-14 h-11 rounded-lg bg-slate-800 border px-2 text-center disabled:opacity-50"
                      :class="pair.rowA.repsInvalid ? 'border-rose-500' : 'border-slate-700'"
                    />
                    <button
                      @click="toggleUnit(pair.rowA)"
                      :disabled="pair.rowA.checked"
                      class="w-14 h-11 flex-shrink-0 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold uppercase disabled:opacity-50"
                    >{{ pair.rowA.unit }}</button>
                    <button
                      @click="checkRow(block.exercises[0].id, pair.rowA, pair.rowB)"
                      :aria-label="pair.rowA.checked ? 'Set logged' : 'Log set'"
                      class="w-11 h-11 flex-shrink-0 rounded-lg border-2 flex items-center justify-center"
                      :class="pair.rowA.checked ? 'bg-emerald-500 border-emerald-500 text-slate-950' : 'border-slate-700'"
                    >
                      <span v-if="pair.rowA.checked">&#10003;</span>
                    </button>
                  </div>
                </div>

                <div>
                  <div class="text-xs text-slate-400 mb-1">{{ block.exercises[1].name }}</div>
                  <div class="flex items-center gap-1.5">
                    <input
                      v-model="pair.rowB.weightEntered"
                      @input="pair.rowB.weightInvalid = false"
                      :disabled="pair.rowB.checked"
                      inputmode="decimal"
                      type="text"
                      placeholder="Weight"
                      class="w-20 h-11 rounded-lg bg-slate-800 border px-2 text-center disabled:opacity-50"
                      :class="pair.rowB.weightInvalid ? 'border-rose-500' : 'border-slate-700'"
                    />
                    <input
                      v-model="pair.rowB.reps"
                      @input="pair.rowB.repsInvalid = false"
                      :disabled="pair.rowB.checked"
                      inputmode="numeric"
                      type="text"
                      placeholder="Reps"
                      class="w-14 h-11 rounded-lg bg-slate-800 border px-2 text-center disabled:opacity-50"
                      :class="pair.rowB.repsInvalid ? 'border-rose-500' : 'border-slate-700'"
                    />
                    <button
                      @click="toggleUnit(pair.rowB)"
                      :disabled="pair.rowB.checked"
                      class="w-14 h-11 flex-shrink-0 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold uppercase disabled:opacity-50"
                    >{{ pair.rowB.unit }}</button>
                    <button
                      @click="checkRow(block.exercises[1].id, pair.rowB, pair.rowA)"
                      :aria-label="pair.rowB.checked ? 'Set logged' : 'Log set'"
                      class="w-11 h-11 flex-shrink-0 rounded-lg border-2 flex items-center justify-center"
                      :class="pair.rowB.checked ? 'bg-emerald-500 border-emerald-500 text-slate-950' : 'border-slate-700'"
                    >
                      <span v-if="pair.rowB.checked">&#10003;</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <button @click="addSupersetRow(block.exercises[0].id, block.exercises[1].id)" class="mt-3 w-full py-2.5 rounded-lg bg-slate-800 text-sm font-semibold text-emerald-400 active:bg-slate-700">+ Add set</button>
          </div>
        </div>
      </main>

      <div class="px-4">
        <button
          @click="emit('navigate', 'dashboard')"
          class="w-full py-4 rounded-xl bg-emerald-500 text-slate-950 font-semibold text-base active:bg-emerald-400"
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
  `,
};
