import { searchExercises, createExercise, createRoutine, setSupersetLink, clearSupersetLink } from '../db.js';

export default {
  props: {
    navParams: { type: Object, default: () => ({}) },
  },
  emits: ['navigate'],
  setup(props, { emit }) {
    const { ref, computed, watch } = Vue;

    const routineName = ref('');
    const searchQuery = ref('');
    const searchResults = ref([]);
    const selectedExercises = ref([]);
    const linkModeExerciseId = ref(null);

    watch(searchQuery, async (query) => {
      searchResults.value = await searchExercises(query);
    }, { immediate: true });

    const exactMatchExists = computed(() =>
      searchResults.value.some((e) => e.name.toLowerCase() === searchQuery.value.trim().toLowerCase())
    );

    function isSelected(exercise) {
      return selectedExercises.value.some((e) => e.id === exercise.id);
    }

    function addExercise(exercise) {
      if (isSelected(exercise)) return;
      selectedExercises.value.push(exercise);
    }

    async function createAndAddExercise() {
      const name = searchQuery.value.trim();
      if (!name) return;
      const exercise = await createExercise({ name });
      selectedExercises.value.push(exercise);
      searchQuery.value = '';
    }

    function removeExercise(exercise) {
      selectedExercises.value = selectedExercises.value.filter((e) => e.id !== exercise.id);
    }

    // Tap a link icon to enter "link mode"; tap a second row's link icon to
    // complete the pair. Tapping an already-linked row's icon unlinks it.
    async function toggleLink(exercise) {
      if (exercise.supersetWith) {
        await clearSupersetLink(exercise.id);
        const partner = selectedExercises.value.find((e) => e.id === exercise.supersetWith);
        exercise.supersetWith = null;
        if (partner) partner.supersetWith = null;
        return;
      }

      if (linkModeExerciseId.value === null) {
        linkModeExerciseId.value = exercise.id;
        return;
      }

      if (linkModeExerciseId.value === exercise.id) {
        linkModeExerciseId.value = null;
        return;
      }

      const partner = selectedExercises.value.find((e) => e.id === linkModeExerciseId.value);
      await setSupersetLink(exercise.id, linkModeExerciseId.value);
      exercise.supersetWith = linkModeExerciseId.value;
      if (partner) partner.supersetWith = exercise.id;
      linkModeExerciseId.value = null;
    }

    const canSave = computed(() => routineName.value.trim().length > 0 && selectedExercises.value.length > 0);

    async function save() {
      if (!canSave.value) return;
      await createRoutine({
        name: routineName.value.trim(),
        exerciseIds: selectedExercises.value.map((e) => e.id),
      });
      emit('navigate', 'dashboard');
    }

    return {
      routineName,
      searchQuery,
      searchResults,
      selectedExercises,
      linkModeExerciseId,
      exactMatchExists,
      isSelected,
      addExercise,
      createAndAddExercise,
      removeExercise,
      toggleLink,
      canSave,
      save,
      emit,
    };
  },
  template: `
    <div class="min-h-screen bg-slate-950 text-slate-100 pb-10">
      <header class="flex items-center gap-3 px-4 py-5 sticky top-0 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <button @click="emit('navigate', 'dashboard')" aria-label="Back" class="w-10 h-10 flex items-center justify-center rounded-full bg-slate-800">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="text-lg font-bold">New Routine</h1>
      </header>

      <main class="px-4 py-4 space-y-6">
        <div>
          <label class="text-sm text-slate-400 mb-1 block">Routine name</label>
          <input
            v-model="routineName"
            type="text"
            placeholder="e.g. Push Day A"
            class="w-full rounded-xl bg-slate-900 border border-slate-800 px-4 py-3 text-base"
          />
        </div>

        <div>
          <label class="text-sm text-slate-400 mb-1 block">Add exercises</label>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search exercises..."
            class="w-full rounded-xl bg-slate-900 border border-slate-800 px-4 py-3 text-base"
          />

          <div v-if="searchQuery.trim()" class="mt-2 space-y-1">
            <button
              v-for="exercise in searchResults"
              :key="exercise.id"
              @click="addExercise(exercise)"
              :disabled="isSelected(exercise)"
              class="w-full text-left px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 disabled:opacity-40"
            >
              {{ exercise.name }}
            </button>
            <button
              v-if="!exactMatchExists"
              @click="createAndAddExercise"
              class="w-full text-left px-4 py-3 rounded-xl bg-emerald-950 border border-emerald-800 text-emerald-300"
            >
              + Create "{{ searchQuery }}" as new exercise
            </button>
          </div>
        </div>

        <div v-if="selectedExercises.length">
          <label class="text-sm text-slate-400 mb-2 block">
            Routine order
            <span v-if="linkModeExerciseId" class="text-emerald-400">— tap another exercise's link icon to pair as a superset</span>
          </label>
          <div class="space-y-2">
            <div
              v-for="exercise in selectedExercises"
              :key="exercise.id"
              class="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900 border"
              :class="exercise.supersetWith ? 'border-emerald-700' : 'border-slate-800'"
            >
              <span class="flex-1">{{ exercise.name }}</span>
              <button
                @click="toggleLink(exercise)"
                :aria-label="exercise.supersetWith ? 'Unlink superset' : 'Link as superset'"
                class="w-9 h-9 flex items-center justify-center rounded-full"
                :class="exercise.supersetWith || linkModeExerciseId === exercise.id ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" />
                </svg>
              </button>
              <button @click="removeExercise(exercise)" aria-label="Remove" class="w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 text-slate-400">
                &times;
              </button>
            </div>
          </div>
        </div>
      </main>

      <div class="px-4">
        <button
          @click="save"
          :disabled="!canSave"
          class="w-full py-4 rounded-xl bg-emerald-500 text-slate-950 font-semibold text-base disabled:opacity-30"
        >
          Save Routine
        </button>
      </div>
    </div>
  `,
};
