<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { getAllExercises, getSetsForExercise, formatWeight, type Exercise, type SetEntry } from '../../shared/db';
import { settings } from '../../shared/store';
import { useTrendChart, type TrendChartPoint } from '../../shared/composables/useTrendChart';
import ScreenHeader from '../../shared/components/ScreenHeader.vue';
import EmptyState from '../../shared/components/EmptyState.vue';
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

const { points, polylinePoints } = useTrendChart(sets, (s) => s.weightInLbs, {
  width: CHART_WIDTH,
  height: CHART_HEIGHT,
  padding: PADDING,
});

function openModal(point: TrendChartPoint<SetEntry>) {
  activeModalSet.value = point.item;
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
    <ScreenHeader title="Progress" @back="emit('navigate', 'dashboard')" />

    <main class="px-4 py-4 space-y-4">
      <select
        v-model="selectedExerciseId"
        class="w-full rounded-xl bg-surface border border-border px-4 py-3 text-base"
      >
        <option v-for="exercise in exercises" :key="exercise.id" :value="exercise.id">{{ exercise.name }}</option>
      </select>

      <EmptyState v-if="sets.length === 0">No logged sets for this exercise yet.</EmptyState>

      <div v-else class="bg-surface border border-border rounded-2xl p-4">
        <svg :viewBox="'0 0 ' + CHART_WIDTH + ' ' + CHART_HEIGHT" class="w-full h-auto">
          <polyline :points="polylinePoints" fill="none" stroke="var(--color-primary)" stroke-width="2" />
          <g v-for="(point, i) in points" :key="i" @click="openModal(point)" class="cursor-pointer">
            <circle :cx="point.x" :cy="point.y" r="14" fill="transparent" />
            <circle :cx="point.x" :cy="point.y" r="5" fill="var(--color-primary)" />
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
