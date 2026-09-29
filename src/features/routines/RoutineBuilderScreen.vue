<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  searchExercises,
  createExercise,
  createRoutine,
  updateRoutine,
  updateExercise,
  getRoutineById,
  getExercisesForRoutine,
  setExerciseGroup,
  removeFromGroup,
  RESISTANCE_TYPES,
  EXERCISE_TYPES,
  groupLabel,
  UX_MAX_GROUP_SIZE,
  type Exercise,
  type ResistanceType,
  type ExerciseType,
} from '../../shared/db';
import { COMMON_EXERCISES } from '../../shared/common-exercises';
import { useDragReorder } from '../../shared/useDragReorder';
import ScreenHeader from '../../shared/components/ScreenHeader.vue';
import SegmentedToggle from '../../shared/components/SegmentedToggle.vue';
import { setHighlightRoutineId } from '../../shared/flash-state';

/**
 * mergedResults mixes real Exercise rows with not-yet-created suggestions
 * from COMMON_EXERCISES (id: null until the user selects one).
 */
type ExerciseOption = Exercise | { id: null; name: string };

const route = useRoute();
const router = useRouter();

const editingRoutineId = ref((route.params.routineId as string) || null);
const routineName = ref('');
const searchQuery = ref('');
const searchResults = ref<Exercise[]>([]);
const selectedExercises = ref<Exercise[]>([]);
const selectMode = ref(false);
const selectedIds = ref<Set<string>>(new Set());

/**
 * Applied to whatever exercise gets created next via search/create-new —
 * existing exercises keep whatever type they already have, edited via the
 * per-row cycle button in "Routine order" instead.
 */
const newExerciseResistanceType = ref<ResistanceType>('weight');
const newExerciseType = ref<ExerciseType>('regular');

async function setResistanceType(exercise: Exercise, value: ResistanceType) {
  await updateExercise(exercise.id, { resistanceType: value });
  exercise.resistanceType = value;
}

async function setExerciseType(exercise: Exercise, value: ExerciseType) {
  await updateExercise(exercise.id, { exerciseType: value });
  exercise.exerciseType = value;
}

const { draggingIndex, dragOffset, setRowEl, onRowPointerDown } = useDragReorder(selectedExercises, {
  gap: 8, // space-y-2
  fallbackHeight: 108, // two-line row: name + drag/remove line, plus type/link controls line
});

onMounted(async () => {
  if (!editingRoutineId.value) return;
  const routine = await getRoutineById(editingRoutineId.value);
  if (!routine) return;
  routineName.value = routine.name;
  selectedExercises.value = await getExercisesForRoutine(routine);
});

watch(searchQuery, async (query) => {
  searchResults.value = await searchExercises(query);
}, { immediate: true });

/**
 * Merges the user's own saved exercises with the common-exercise
 * suggestion list, so autocomplete works even before any exercise has
 * ever been created. Common suggestions with no DB record yet are
 * represented with id: null and get created on first selection.
 */
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
  const created = await createExercise({
    name: exercise.name,
    resistanceType: newExerciseResistanceType.value,
    exerciseType: newExerciseType.value,
  });
  selectedExercises.value.push(created);
}

async function createAndAddExercise() {
  const name = searchQuery.value.trim();
  if (!name) return;
  const exercise = await createExercise({
    name,
    resistanceType: newExerciseResistanceType.value,
    exerciseType: newExerciseType.value,
  });
  selectedExercises.value.push(exercise);
  searchQuery.value = '';
}

function removeExercise(exercise: Exercise) {
  selectedExercises.value = selectedExercises.value.filter((e) => e.id !== exercise.id);
}

function toggleSelectMode() {
  selectMode.value = !selectMode.value;
  selectedIds.value = new Set();
}

function toggleSelected(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

const canGroupSelected = computed(() => selectedIds.value.size >= 2 && selectedIds.value.size <= UX_MAX_GROUP_SIZE);

function groupSizeFor(exercise: Exercise): number {
  return selectedExercises.value.filter((e) => e.groupId === exercise.groupId).length;
}

/**
 * ActiveWorkoutScreen emits a group's block at its first member's routine
 * position, so members must sit contiguously here too or builder order and
 * workout-render order diverge. Keeps every exercise's relative order,
 * just slots the new group in at the earliest member's old position.
 */
function makeGroupContiguous(groupId: string) {
  const original = selectedExercises.value;
  const members = original.filter((e) => e.groupId === groupId);
  if (members.length < 2) return;
  const nonMembers = original.filter((e) => e.groupId !== groupId);
  const firstMemberIndex = original.findIndex((e) => e.groupId === groupId);
  const insertAt = original.slice(0, firstMemberIndex).filter((e) => e.groupId !== groupId).length;
  selectedExercises.value = [...nonMembers.slice(0, insertAt), ...members, ...nonMembers.slice(insertAt)];
}

async function groupSelected() {
  if (!canGroupSelected.value) return;
  const ids = [...selectedIds.value];
  const groupId = await setExerciseGroup(ids);
  if (groupId) {
    for (const exercise of selectedExercises.value) {
      if (ids.includes(exercise.id)) exercise.groupId = groupId;
    }
    makeGroupContiguous(groupId);
  }
  toggleSelectMode();
}

// Mirrors removeFromGroup's server-side dissolve: a group left with 1
// member is ungrouped too, so the local copy can't show a stale badge.
async function ungroup(exercise: Exercise) {
  const groupId = exercise.groupId;
  await removeFromGroup(exercise.id);
  exercise.groupId = null;
  const remaining = selectedExercises.value.filter((e) => e.groupId === groupId);
  if (remaining.length === 1) remaining[0].groupId = null;
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
    router.push({ name: 'dashboard' });
  } else {
    const routine = await createRoutine(payload);
    setHighlightRoutineId(routine.id);
    router.push({ name: 'dashboard' });
  }
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground pb-10">
    <ScreenHeader :title="editingRoutineId ? 'Edit Routine' : 'New Routine'" />

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

        <div class="mt-2">
          <SegmentedToggle :options="RESISTANCE_TYPES" v-model="newExerciseResistanceType" size="sm" />
        </div>
        <p class="text-xs text-foreground-faint mt-1">Resistance type for the next new exercise you add.</p>

        <div class="mt-2">
          <SegmentedToggle :options="EXERCISE_TYPES" v-model="newExerciseType" size="sm" />
        </div>
        <p class="text-xs text-foreground-faint mt-1">Exercise type for the next new exercise you add — controls rest duration.</p>

        <div v-if="searchQuery.trim()" class="mt-2 space-y-1">
          <button
            v-if="!exactMatchExists"
            @click="createAndAddExercise"
            class="w-full text-left px-4 py-3 rounded-xl bg-primary/10 border border-primary/40 text-primary-bright"
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
        <label class="text-sm text-foreground-muted mb-2 flex items-center justify-between">
          <span>Routine order</span>
          <button @click="toggleSelectMode" class="text-xs font-semibold text-secondary">{{ selectMode ? 'Cancel' : 'Select' }}</button>
        </label>

        <div v-if="selectMode" class="space-y-2">
          <label
            v-for="exercise in selectedExercises"
            :key="exercise.id"
            class="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-border"
          >
            <input
              type="checkbox"
              class="w-5 h-5 accent-primary-bright flex-shrink-0"
              :checked="selectedIds.has(exercise.id)"
              @change="toggleSelected(exercise.id)"
            />
            <span class="flex-1">{{ exercise.name }}</span>
          </label>
          <button
            @click="groupSelected"
            :disabled="!canGroupSelected"
            class="w-full py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold disabled:opacity-40"
          >
            Group Selected ({{ selectedIds.size }})
          </button>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="(exercise, index) in selectedExercises"
            :key="exercise.id"
            :ref="(el) => setRowEl(index, el as HTMLElement | null)"
            class="flex flex-col gap-2 px-4 py-3 rounded-xl bg-surface border select-none"
            :class="[exercise.groupId ? 'border-primary/40' : 'border-border', draggingIndex === index ? 'relative z-10 shadow-xl' : '']"
            :style="draggingIndex === index ? { transform: 'translateY(' + dragOffset + 'px)' } : {}"
          >
            <div class="flex items-center gap-2">
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
              <button @click="removeExercise(exercise)" aria-label="Remove" class="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full bg-surface-2 text-foreground-muted text-lg">
                &times;
              </button>
            </div>
            <div class="flex items-center gap-2 pl-[52px]">
              <select
                :value="exercise.resistanceType || 'weight'"
                @change="setResistanceType(exercise, ($event.target as HTMLSelectElement).value as ResistanceType)"
                :aria-label="'Resistance type for ' + exercise.name"
                class="pl-2.5 pr-1 h-8 flex-shrink-0 rounded-full bg-surface-2 text-foreground-subtle text-[10px] font-semibold uppercase tracking-wide border-none appearance-none"
              >
                <option v-for="opt in RESISTANCE_TYPES" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <select
                :value="exercise.exerciseType || 'regular'"
                @change="setExerciseType(exercise, ($event.target as HTMLSelectElement).value as ExerciseType)"
                :aria-label="'Exercise type for ' + exercise.name"
                class="pl-2.5 pr-1 h-8 flex-shrink-0 rounded-full bg-surface-2 text-foreground-subtle text-[10px] font-semibold uppercase tracking-wide border-none appearance-none"
              >
                <option v-for="opt in EXERCISE_TYPES" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <button
                v-if="exercise.groupId"
                @click="ungroup(exercise)"
                :aria-label="'Remove from ' + groupLabel(groupSizeFor(exercise))"
                class="px-2.5 h-8 flex-shrink-0 rounded-full bg-primary-strong text-on-primary-strong text-[10px] font-semibold uppercase tracking-wide"
              >
                {{ groupLabel(groupSizeFor(exercise)) }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <div class="px-4">
      <button
        @click="save"
        :disabled="!canSave"
        class="w-full py-4 rounded-xl bg-primary text-on-primary font-semibold text-base disabled:opacity-30"
      >
        Save Routine
      </button>
    </div>
  </div>
</template>
