import { getAllSets, getAllExercises, updateSet, formatWeight } from '../db.js';
import { settings } from '../store.js';

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default {
  props: {
    navParams: { type: Object, default: () => ({}) },
  },
  emits: ['navigate'],
  setup(props, { emit }) {
    const { ref, onMounted } = Vue;

    const days = ref([]);
    const editingId = ref(null);

    onMounted(async () => {
      const [sets, exercises] = await Promise.all([getAllSets(), getAllExercises()]);
      const exerciseById = new Map(exercises.map((e) => [e.id, e]));

      const byDate = new Map();
      for (const set of sets) {
        if (!byDate.has(set.date)) byDate.set(set.date, new Map());
        const byExercise = byDate.get(set.date);
        if (!byExercise.has(set.exerciseId)) byExercise.set(set.exerciseId, []);
        byExercise.get(set.exerciseId).push(set);
      }

      days.value = [...byDate.entries()].map(([date, byExercise]) => ({
        date,
        label: formatDate(date),
        exercises: [...byExercise.entries()].map(([exerciseId, exerciseSets]) => ({
          name: exerciseById.get(exerciseId)?.name || 'Unknown exercise',
          sets: exerciseSets,
        })),
      }));
    });

    function formattedSet(set) {
      const weight = formatWeight(set.weightInLbs, settings.preferredUnit);
      return set.weightInLbs ? `${weight} ${settings.preferredUnit} x ${set.reps}` : `${set.reps} reps`;
    }

    // Edits happen inline against a copy of the values (set._editWeight etc.)
    // so the read-only pill doesn't change mid-edit — only Save persists and
    // updates the real fields, matching the weight-optional/reps-required
    // rule the active workout screen uses.
    function startEdit(set) {
      set._editWeight = String(set.weightEntered);
      set._editReps = String(set.reps);
      set._editUnit = set.unit;
      editingId.value = set.id;
    }

    function cancelEdit(set) {
      delete set._editWeight;
      delete set._editReps;
      delete set._editUnit;
      editingId.value = null;
    }

    function toggleEditUnit(set) {
      set._editUnit = set._editUnit === 'lbs' ? 'kg' : 'lbs';
    }

    function editIsValid(set) {
      const weightText = (set._editWeight || '').trim();
      const weightEntered = weightText === '' ? 0 : parseFloat(weightText);
      const reps = parseInt(set._editReps, 10);
      return !Number.isNaN(weightEntered) && !Number.isNaN(reps);
    }

    async function saveEdit(set) {
      if (!editIsValid(set)) return;
      const weightText = set._editWeight.trim();
      const weightEntered = weightText === '' ? 0 : parseFloat(weightText);
      const reps = parseInt(set._editReps, 10);
      const unit = set._editUnit;
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

    return {
      days,
      editingId,
      formattedSet,
      startEdit,
      cancelEdit,
      toggleEditUnit,
      editIsValid,
      saveEdit,
      emit,
    };
  },
  template: `
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
          :key="day.date"
          class="bg-slate-900 border border-slate-800 rounded-2xl p-4"
        >
          <h2 class="font-semibold text-base mb-3">{{ day.label }}</h2>
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
  `,
};
