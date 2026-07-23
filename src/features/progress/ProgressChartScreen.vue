<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import { getAllExercises, getSetsForExercise, formatWeight, type Exercise, type SetEntry } from '../../shared/db';
import { settings } from '../../shared/store';
import type { NavParams, ScreenName } from '../../shared/types';

const CHART_WIDTH = 320;
const CHART_HEIGHT = 200;
const PADDING = 24;

const props = defineProps<{
  navParams?: NavParams;
}>();
const emit = defineEmits<{
  navigate: [screen: ScreenName, params?: NavParams];
}>();

interface ChartPoint {
  x: number;
  y: number;
  set: SetEntry;
}

const exercises = ref<Exercise[]>([]);
const selectedExerciseId = ref(props.navParams?.initialExerciseId || '');
const sets = ref<SetEntry[]>([]);
const activeModalSet = ref<SetEntry | null>(null);

onMounted(async () => {
  exercises.value = await getAllExercises();
  if (!selectedExerciseId.value && exercises.value.length) {
    selectedExerciseId.value = exercises.value[0].id;
  }
});

watch(selectedExerciseId, async (id) => {
  sets.value = id ? await getSetsForExercise(id) : [];
}, { immediate: true });

const points = computed<ChartPoint[]>(() => {
  if (sets.value.length === 0) return [];
  const weights = sets.value.map((s) => s.weightInLbs);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;
  const usableWidth = CHART_WIDTH - PADDING * 2;
  const usableHeight = CHART_HEIGHT - PADDING * 2;
  const step = sets.value.length > 1 ? usableWidth / (sets.value.length - 1) : 0;

  return sets.value.map((s, i) => {
    const x = PADDING + step * i;
    const y = PADDING + usableHeight - ((s.weightInLbs - min) / range) * usableHeight;
    return { x, y, set: s };
  });
});

const polylinePoints = computed(() => points.value.map((p) => `${p.x},${p.y}`).join(' '));

function openModal(point: ChartPoint) {
  activeModalSet.value = point.set;
}

function closeModal() {
  activeModalSet.value = null;
}

function formattedEntry(set: SetEntry) {
  const weight = formatWeight(set.weightInLbs, settings.preferredUnit);
  return `${set.date}: ${weight} ${settings.preferredUnit} x ${set.reps} reps`;
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
      <h1 class="text-lg font-bold">Progress</h1>
    </header>

    <main class="px-4 py-4 space-y-4">
      <select
        v-model="selectedExerciseId"
        class="w-full rounded-xl bg-surface border border-border px-4 py-3 text-base"
      >
        <option v-for="exercise in exercises" :key="exercise.id" :value="exercise.id">{{ exercise.name }}</option>
      </select>

      <div v-if="sets.length === 0" class="text-foreground-muted text-center mt-16">
        No logged sets for this exercise yet.
      </div>

      <div v-else class="bg-surface border border-border rounded-2xl p-4">
        <svg :viewBox="'0 0 ' + CHART_WIDTH + ' ' + CHART_HEIGHT" class="w-full h-auto">
          <polyline :points="polylinePoints" fill="none" stroke="var(--color-accent)" stroke-width="2" />
          <g v-for="(point, i) in points" :key="i" @click="openModal(point)" class="cursor-pointer">
            <circle :cx="point.x" :cy="point.y" r="14" fill="transparent" />
            <circle :cx="point.x" :cy="point.y" r="5" fill="var(--color-accent)" />
          </g>
        </svg>
      </div>
    </main>

    <div
      v-if="activeModalSet"
      @click.self="closeModal"
      class="fixed inset-0 bg-overlay/60 flex items-center justify-center px-6"
    >
      <div class="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm">
        <p class="text-base mb-4">{{ formattedEntry(activeModalSet) }}</p>
        <button @click="closeModal" class="w-full py-3 rounded-xl bg-surface-2 font-semibold">Close</button>
      </div>
    </div>
  </div>
</template>
