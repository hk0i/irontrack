import { getRoutineById, getExerciseById, getLastSetForExercise, logSet, formatWeight, kgToLbs } from '../db.js';
import { settings } from '../store.js';

const REST_SECONDS = 90;

function todayString() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function makeEmptyRow() {
  return Vue.reactive({
    weightEntered: '',
    reps: '',
    unit: settings.preferredUnit,
    checked: false,
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

      for (const exercise of exercises) {
        if (!exercise) continue;
        setRowsByExercise[exercise.id] = reactive([makeEmptyRow()]);
        const lastSet = await getLastSetForExercise(exercise.id);
        ghostTextByExercise[exercise.id] = lastSet
          ? `${formatWeight(lastSet.weightInLbs, lastSet.unit)} ${lastSet.unit} x ${lastSet.reps}`
          : null;
      }
    }

    onMounted(loadWorkout);
    onUnmounted(() => {
      if (restInterval) clearInterval(restInterval);
    });

    function addRow(exerciseId) {
      setRowsByExercise[exerciseId].push(makeEmptyRow());
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

    async function checkRow(exerciseId, row) {
      if (row.checked) return;
      const weightEntered = parseFloat(row.weightEntered);
      const reps = parseInt(row.reps, 10);
      if (Number.isNaN(weightEntered) || Number.isNaN(reps)) return;
      await logSet({
        exerciseId,
        date: todayString(),
        reps,
        weightEntered,
        unit: row.unit,
      });
      row.checked = true;
      const weightInLbs = row.unit === 'kg' ? kgToLbs(weightEntered) : weightEntered;
      ghostTextByExercise[exerciseId] = `${formatWeight(weightInLbs, row.unit)} ${row.unit} x ${reps}`;
      startRestBanner();
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
        <div
          v-for="block in blocks"
          :key="block.exercises[0].id"
          class="relative"
          :class="block.exercises.length > 1 ? 'pl-4 border-l-4 border-emerald-600 space-y-4' : ''"
        >
          <div v-for="exercise in block.exercises" :key="exercise.id" class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div class="flex items-center justify-between mb-1">
              <h2 class="font-semibold text-base">{{ exercise.name }}</h2>
              <button @click="viewHistory(exercise.id)" class="px-3 py-2 rounded-lg bg-slate-800 text-xs font-semibold text-emerald-400 active:bg-slate-700">History</button>
            </div>
            <div class="text-sm text-slate-400 mb-3">
              <span v-if="ghostTextByExercise[exercise.id]">Last: [{{ ghostTextByExercise[exercise.id] }}]</span>
              <span v-else>No history yet</span>
            </div>

            <div class="space-y-2">
              <div
                v-for="(row, index) in setRowsByExercise[exercise.id]"
                :key="index"
                class="flex items-center gap-2"
              >
                <span class="w-5 text-sm text-slate-500 text-center">{{ index + 1 }}</span>
                <input
                  v-model="row.weightEntered"
                  :disabled="row.checked"
                  inputmode="decimal"
                  type="text"
                  placeholder="Weight"
                  class="w-20 h-11 rounded-lg bg-slate-800 border border-slate-700 px-2 text-center disabled:opacity-50"
                />
                <input
                  v-model="row.reps"
                  :disabled="row.checked"
                  inputmode="numeric"
                  type="text"
                  placeholder="Reps"
                  class="w-16 h-11 rounded-lg bg-slate-800 border border-slate-700 px-2 text-center disabled:opacity-50"
                />
                <button
                  @click="toggleUnit(row)"
                  :disabled="row.checked"
                  class="w-14 h-11 flex-shrink-0 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold uppercase disabled:opacity-50"
                >
                  {{ row.unit }}
                </button>
                <button
                  @click="checkRow(exercise.id, row)"
                  :aria-label="row.checked ? 'Set logged' : 'Log set'"
                  class="w-11 h-11 rounded-lg border-2 flex items-center justify-center flex-shrink-0"
                  :class="row.checked ? 'bg-emerald-500 border-emerald-500 text-slate-950' : 'border-slate-700'"
                >
                  <span v-if="row.checked">&#10003;</span>
                </button>
              </div>
            </div>

            <button @click="addRow(exercise.id)" class="mt-3 w-full py-2.5 rounded-lg bg-slate-800 text-sm font-semibold text-emerald-400 active:bg-slate-700">+ Add set</button>
          </div>
        </div>
      </main>

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
