<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import {
  searchExercises,
  createExercise,
  createRoutine,
  updateRoutine,
  updateExercise,
  getRoutineById,
  getExerciseById,
  setSupersetLink,
  clearSupersetLink,
  type Exercise,
  type ResistanceType,
} from '../../shared/db';
import { COMMON_EXERCISES } from '../../shared/common-exercises';
import type { NavParams, ScreenName } from '../../shared/types';

// mergedResults mixes real Exercise rows with not-yet-created suggestions
// from COMMON_EXERCISES (id: null until the user selects one).
type ExerciseOption = Exercise | { id: null; name: string };

const props = defineProps<{
  navParams?: NavParams;
}>();
const emit = defineEmits<{
  navigate: [screen: ScreenName, params?: NavParams];
}>();

const editingRoutineId = ref(props.navParams?.routineId || null);
const routineName = ref('');
const searchQuery = ref('');
const searchResults = ref<Exercise[]>([]);
const selectedExercises = ref<Exercise[]>([]);
const linkModeExerciseId = ref<string | null>(null);

// Applied to whatever exercise gets created next via search/create-new —
// existing exercises keep whatever type they already have, edited via the
// per-row cycle button in "Routine order" instead.
const RESISTANCE_TYPES: { value: ResistanceType; label: string }[] = [
  { value: 'weight', label: 'Weight' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'bands', label: 'Bands' },
];
const newExerciseResistanceType = ref<ResistanceType>('weight');

function cycleResistanceType(current: ResistanceType | undefined): ResistanceType {
  const order: ResistanceType[] = ['weight', 'bodyweight', 'bands'];
  const index = order.indexOf(current || 'weight');
  return order[(index + 1) % order.length];
}

async function toggleResistanceType(exercise: Exercise) {
  const next = cycleResistanceType(exercise.resistanceType);
  await updateExercise(exercise.id, { resistanceType: next });
  exercise.resistanceType = next;
}

const draggingIndex = ref<number | null>(null);
const dragOffset = ref(0);
const rowEls: (HTMLElement | null)[] = [];
let pointerStartY = 0;
let rowStep = 0;

function onRowPointerDown(event: PointerEvent, index: number) {
  event.preventDefault();
  draggingIndex.value = index;
  dragOffset.value = 0;
  pointerStartY = event.clientY;
  const rect = rowEls[index]?.getBoundingClientRect();
  rowStep = (rect?.height || 56) + 8; // row height + space-y-2 gap
  window.addEventListener('pointermove', onRowPointerMove);
  window.addEventListener('pointerup', onRowPointerUp);
}

function onRowPointerMove(event: PointerEvent) {
  if (draggingIndex.value === null) return;
  dragOffset.value = event.clientY - pointerStartY;
  const from = draggingIndex.value;
  const maxIndex = selectedExercises.value.length - 1;
  let to = from + Math.round(dragOffset.value / rowStep);
  to = Math.max(0, Math.min(maxIndex, to));
  if (to !== from) {
    const arr = selectedExercises.value;
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    pointerStartY += (to - from) * rowStep;
    dragOffset.value = event.clientY - pointerStartY;
    draggingIndex.value = to;
  }
}

function onRowPointerUp() {
  draggingIndex.value = null;
  dragOffset.value = 0;
  window.removeEventListener('pointermove', onRowPointerMove);
  window.removeEventListener('pointerup', onRowPointerUp);
}

onUnmounted(() => {
  window.removeEventListener('pointermove', onRowPointerMove);
  window.removeEventListener('pointerup', onRowPointerUp);
});

onMounted(async () => {
  if (!editingRoutineId.value) return;
  const routine = await getRoutineById(editingRoutineId.value);
  if (!routine) return;
  routineName.value = routine.name;
  const exercises: Exercise[] = [];
  for (const id of routine.exerciseIds) {
    const exercise = await getExerciseById(id);
    if (exercise) exercises.push(exercise);
  }
  selectedExercises.value = exercises;
});

watch(searchQuery, async (query) => {
  searchResults.value = await searchExercises(query);
}, { immediate: true });

// Merges the user's own saved exercises with the common-exercise
// suggestion list, so autocomplete works even before any exercise has
// ever been created. Common suggestions with no DB record yet are
// represented with id: null and get created on first selection.
const mergedResults = computed<ExerciseOption[]>(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return [];
  const dbNames = new Set(searchResults.value.map((e) => e.name.toLowerCase()));
  const commonMatches = COMMON_EXERCISES
    .filter((name) => name.toLowerCase().includes(query) && !dbNames.has(name.toLowerCase()))
    .map((name) => ({ id: null, name }));
  return [...searchResults.value, ...commonMatches];
});

const exactMatchExists = computed(() =>
  mergedResults.value.some((e) => e.name.toLowerCase() === searchQuery.value.trim().toLowerCase())
);

function isSelected(exercise: ExerciseOption) {
  if (exercise.id) return selectedExercises.value.some((e) => e.id === exercise.id);
  return selectedExercises.value.some((e) => e.name.toLowerCase() === exercise.name.toLowerCase());
}

async function addExercise(exercise: ExerciseOption) {
  if (isSelected(exercise)) return;
  if (exercise.id) {
    selectedExercises.value.push(exercise);
    return;
  }
  const created = await createExercise({ name: exercise.name, resistanceType: newExerciseResistanceType.value });
  selectedExercises.value.push(created);
}

async function createAndAddExercise() {
  const name = searchQuery.value.trim();
  if (!name) return;
  const exercise = await createExercise({ name, resistanceType: newExerciseResistanceType.value });
  selectedExercises.value.push(exercise);
  searchQuery.value = '';
}

function removeExercise(exercise: Exercise) {
  selectedExercises.value = selectedExercises.value.filter((e) => e.id !== exercise.id);
}

// Tap a link icon to enter "link mode"; tap a second row's link icon to
// complete the pair. Tapping an already-linked row's icon unlinks it.
async function toggleLink(exercise: Exercise) {
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
  const payload = {
    name: routineName.value.trim(),
    exerciseIds: selectedExercises.value.map((e) => e.id),
  };
  if (editingRoutineId.value) {
    await updateRoutine(editingRoutineId.value, payload);
  } else {
    await createRoutine(payload);
  }
  emit('navigate', 'dashboard');
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground pb-10">
    <header class="flex items-center gap-3 px-4 py-5 sticky top-0 bg-background/95 backdrop-blur border-b border-border">
      <button @click="emit('navigate', 'dashboard')" aria-label="Back" class="w-11 h-11 flex items-center justify-center rounded-full bg-surface-2 active:bg-surface-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class="text-lg font-bold">{{ editingRoutineId ? 'Edit Routine' : 'New Routine' }}</h1>
    </header>

    <main class="px-4 py-4 space-y-6">
      <div>
        <label class="text-sm text-foreground-muted mb-1 block">Routine name</label>
        <input
          v-model="routineName"
          type="text"
          placeholder="e.g. Push Day A"
          class="w-full rounded-xl bg-surface border border-border px-4 py-3 text-base"
        />
      </div>

      <div>
        <label class="text-sm text-foreground-muted mb-1 block">Add exercises</label>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search exercises..."
          class="w-full rounded-xl bg-surface border border-border px-4 py-3 text-base"
        />

        <div class="flex rounded-xl overflow-hidden border border-border mt-2">
          <button
            v-for="option in RESISTANCE_TYPES"
            :key="option.value"
            @click="newExerciseResistanceType = option.value"
            class="flex-1 py-2 text-xs font-semibold"
            :class="newExerciseResistanceType === option.value ? 'bg-accent text-on-accent' : 'bg-surface text-foreground-subtle'"
          >
            {{ option.label }}
          </button>
        </div>
        <p class="text-xs text-foreground-faint mt-1">Resistance type for the next new exercise you add.</p>

        <div v-if="searchQuery.trim()" class="mt-2 space-y-1">
          <button
            v-if="!exactMatchExists"
            @click="createAndAddExercise"
            class="w-full text-left px-4 py-3 rounded-xl bg-accent-soft border border-accent-soft text-accent-soft"
          >
            + Create "{{ searchQuery }}" as new exercise
          </button>
          <button
            v-for="exercise in mergedResults"
            :key="exercise.id || exercise.name"
            @click="addExercise(exercise)"
            :disabled="isSelected(exercise)"
            class="w-full text-left px-4 py-3 rounded-xl bg-surface border border-border disabled:opacity-40"
          >
            {{ exercise.name }}
          </button>
        </div>
      </div>

      <div v-if="selectedExercises.length">
        <label class="text-sm text-foreground-muted mb-2 block">
          Routine order
          <span v-if="linkModeExerciseId" class="text-accent-bright">— tap another exercise's link icon to pair as a superset</span>
        </label>
        <div class="space-y-2">
          <div
            v-for="(exercise, index) in selectedExercises"
            :key="exercise.id"
            :ref="(el) => (rowEls[index] = el as HTMLElement | null)"
            class="flex items-center gap-2 px-4 py-3 rounded-xl bg-surface border select-none"
            :class="[exercise.supersetWith ? 'border-accent-soft' : 'border-border', draggingIndex === index ? 'relative z-10 shadow-xl' : '']"
            :style="draggingIndex === index ? { transform: 'translateY(' + dragOffset + 'px)' } : {}"
          >
            <button
              @pointerdown="onRowPointerDown($event, index)"
              :aria-label="'Drag to reorder ' + exercise.name"
              style="touch-action: none"
              class="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full bg-surface-2 text-foreground-muted cursor-grab active:cursor-grabbing"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="9" cy="6" r="1.5" />
                <circle cx="15" cy="6" r="1.5" />
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="18" r="1.5" />
                <circle cx="15" cy="18" r="1.5" />
              </svg>
            </button>
            <span class="flex-1">{{ exercise.name }}</span>
            <button
              @click="toggleResistanceType(exercise)"
              :aria-label="'Resistance type: ' + (exercise.resistanceType || 'weight') + ', tap to change'"
              class="px-2.5 h-8 flex-shrink-0 flex items-center justify-center rounded-full bg-surface-2 text-foreground-subtle text-[10px] font-semibold uppercase tracking-wide"
            >
              {{ (exercise.resistanceType || 'weight').slice(0, 4) }}
            </button>
            <button
              @click="toggleLink(exercise)"
              :aria-label="exercise.supersetWith ? 'Unlink superset' : 'Link as superset'"
              class="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full"
              :class="exercise.supersetWith || linkModeExerciseId === exercise.id ? 'bg-accent-strong text-on-accent-strong' : 'bg-surface-2 text-foreground-subtle'"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" />
              </svg>
            </button>
            <button @click="removeExercise(exercise)" aria-label="Remove" class="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full bg-surface-2 text-foreground-muted text-lg">
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
        class="w-full py-4 rounded-xl bg-accent text-on-accent font-semibold text-base disabled:opacity-30"
      >
        Save Routine
      </button>
    </div>
  </div>
</template>
