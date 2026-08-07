<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import { getAllExercises, getSetsForExercise, formatWeight, type Exercise, type SetEntry } from '../../shared/db';
import { settings } from '../../shared/store';
import { useMultiTrendChart } from '../../shared/composables/useMultiTrendChart';
import { aggregateSetsByDay, type DailyProgressPoint } from '../../shared/setAggregation';
import ScreenHeader from '../../shared/components/ScreenHeader.vue';
import EmptyState from '../../shared/components/EmptyState.vue';
import type { NavParams, ScreenName } from '../../shared/types';

type SeriesKey = 'weight' | 'volume';
type ChartView = SeriesKey | 'all';

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
const chartSvg = ref<SVGSVGElement | null>(null);
const selectedSeriesKey = ref<SeriesKey>('weight');
const selectedIndex = ref(0);
const selectedView = ref<ChartView>('all');
const showWeight = computed(() => selectedView.value !== 'volume');
const showVolume = computed(() => selectedView.value !== 'weight');

onMounted(async () => {
  exercises.value = await getAllExercises();
  if (!selectedExerciseId.value && exercises.value.length) {
    selectedExerciseId.value = exercises.value[0].id;
  }
});

watch(selectedExerciseId, async (id) => {
  sets.value = id ? await getSetsForExercise(id) : [];
}, { immediate: true });

const dailyPoints = computed<DailyProgressPoint[]>(() => aggregateSetsByDay(sets.value));

// Default to the most recent day whenever the underlying data changes, so
// the detail view is never empty.
watch(dailyPoints, (points) => {
  selectedIndex.value = points.length ? points.length - 1 : 0;
}, { immediate: true });

const { seriesPoints, seriesPolylines } = useMultiTrendChart(
  dailyPoints,
  [
    { key: 'weight', valueOf: (d) => d.weight },
    { key: 'volume', valueOf: (d) => d.volume },
  ],
  { width: CHART_WIDTH, height: CHART_HEIGHT, padding: PADDING }
);

const selectedDay = computed<DailyProgressPoint | null>(() => dailyPoints.value[selectedIndex.value] ?? null);

const selectedPoint = computed(() => {
  const points = seriesPoints.value[selectedSeriesKey.value];
  return points?.[selectedIndex.value] ?? null;
});

const selectedDaySetCount = computed(() => {
  const day = selectedDay.value;
  return day ? sets.value.filter((s) => s.date === day.date).length : 0;
});

// Maps a pointer's clientX to the nearest day index, in the chart's own SVG
// coordinate space (the SVG is scaled by CSS, so we can't compare clientX
// to CHART_WIDTH directly).
function clientXToIndex(clientX: number): number {
  const svg = chartSvg.value;
  const count = dailyPoints.value.length;
  if (!svg || count <= 1) return 0;
  const rect = svg.getBoundingClientRect();
  const svgX = ((clientX - rect.left) / rect.width) * CHART_WIDTH;
  const usableWidth = CHART_WIDTH - PADDING * 2;
  const step = usableWidth / (count - 1);
  const rawIndex = (svgX - PADDING) / step;
  return Math.min(count - 1, Math.max(0, Math.round(rawIndex)));
}

// Starting a gesture on a point locks in which series (weight or volume) is
// being scrubbed for the whole gesture — only x movement is tracked from
// here on, so a drag can't accidentally hop from one line to the other.
function startScrub(seriesKey: SeriesKey, index: number, event: PointerEvent) {
  selectedSeriesKey.value = seriesKey;
  selectedIndex.value = index;
  (event.target as Element).setPointerCapture(event.pointerId);
}

function scrubMove(event: PointerEvent) {
  if (event.buttons === 0) return;
  selectedIndex.value = clientXToIndex(event.clientX);
}

// Overlapping points can make the wrong one hard to grab — switching to a
// single-series view clears the ambiguity. Picking a single view also
// pins the detail panel to that series, since the other one is hidden.
function selectView(view: ChartView) {
  selectedView.value = view;
  if (view !== 'all') selectedSeriesKey.value = view;
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
        <div v-if="selectedDay" class="mb-4 pb-4 border-b border-border flex items-center justify-between gap-4">
          <span class="text-sm text-foreground-muted">{{ selectedDay.date }}</span>
          <span class="text-xl font-semibold text-right">
            <template v-if="selectedSeriesKey === 'weight'">
              {{ formatWeight(selectedDay.weight, settings.preferredUnit) }} {{ settings.preferredUnit }} top set
            </template>
            <template v-else>
              {{ formatWeight(selectedDay.volume, settings.preferredUnit) }} {{ settings.preferredUnit }} volume
            </template>
            <span class="block text-sm text-foreground-muted font-normal">{{ selectedDaySetCount }} sets</span>
          </span>
        </div>

        <div class="inline-flex items-center gap-1 mb-2 p-1 rounded-full bg-surface-2 text-sm">
          <button
            type="button"
            @click="selectView('weight')"
            class="flex items-center gap-1.5 px-3 py-1 rounded-full"
            :class="selectedView === 'weight' ? 'bg-surface-3 text-foreground' : 'text-foreground-muted'"
          >
            <span class="w-2.5 h-2.5 rounded-full" style="background: var(--color-primary)"></span>
            Weight
          </button>
          <button
            type="button"
            @click="selectView('volume')"
            class="flex items-center gap-1.5 px-3 py-1 rounded-full"
            :class="selectedView === 'volume' ? 'bg-surface-3 text-foreground' : 'text-foreground-muted'"
          >
            <span class="w-2.5 h-2.5 rounded-full" style="background: var(--color-chart-2)"></span>
            Volume
          </button>
          <button
            type="button"
            @click="selectView('all')"
            class="flex items-center gap-1.5 px-3 py-1 rounded-full"
            :class="selectedView === 'all' ? 'bg-surface-3 text-foreground' : 'text-foreground-muted'"
          >
            <span
              class="w-2.5 h-2.5 rounded-full"
              style="background: linear-gradient(135deg, var(--color-primary) 50%, var(--color-chart-2) 50%)"
            ></span>
            Show all
          </button>
        </div>
        <svg ref="chartSvg" :viewBox="'0 0 ' + CHART_WIDTH + ' ' + CHART_HEIGHT" class="w-full h-auto touch-none">
          <polyline v-if="showVolume" :points="seriesPolylines.volume" fill="none" stroke="var(--color-chart-2)" stroke-width="2" />
          <polyline v-if="showWeight" :points="seriesPolylines.weight" fill="none" stroke="var(--color-primary)" stroke-width="2" />
          <template v-if="showVolume">
            <g v-for="(point, i) in seriesPoints.volume" :key="'volume-' + i">
              <circle
                :cx="point.x" :cy="point.y" r="14" fill="transparent" class="cursor-pointer"
                @pointerdown="startScrub('volume', i, $event)"
                @pointermove="scrubMove($event)"
              />
              <circle :cx="point.x" :cy="point.y" r="4" fill="var(--color-chart-2)" class="pointer-events-none" />
            </g>
          </template>
          <template v-if="showWeight">
            <g v-for="(point, i) in seriesPoints.weight" :key="'weight-' + i">
              <circle
                :cx="point.x" :cy="point.y" r="14" fill="transparent" class="cursor-pointer"
                @pointerdown="startScrub('weight', i, $event)"
                @pointermove="scrubMove($event)"
              />
              <circle :cx="point.x" :cy="point.y" r="5" fill="var(--color-primary)" class="pointer-events-none" />
            </g>
          </template>
          <circle
            v-if="selectedPoint"
            :cx="selectedPoint.x" :cy="selectedPoint.y" r="9" fill="none"
            :stroke="selectedSeriesKey === 'weight' ? 'var(--color-primary)' : 'var(--color-chart-2)'"
            stroke-width="2" class="pointer-events-none"
          />
        </svg>
      </div>
    </main>
  </div>
</template>
