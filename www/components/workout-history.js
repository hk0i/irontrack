import { getAllSets, getAllExercises, formatWeight } from '../db.js';
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
      return `${weight} ${settings.preferredUnit} x ${set.reps}`;
    }

    return { days, formattedSet, emit };
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
                <span
                  v-for="set in exercise.sets"
                  :key="set.id"
                  class="text-xs px-2 py-1 rounded-lg bg-slate-800 text-slate-300"
                >{{ formattedSet(set) }}</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  `,
};
