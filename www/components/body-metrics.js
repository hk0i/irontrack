import { getAllMetricBlueprints, createMetricBlueprint, logMetric, getRecentLogsForBlueprint, formatMetricValue } from '../db.js';
import { settings } from '../store.js';

const CHART_WIDTH = 320;
const CHART_HEIGHT = 160;
const PADDING = 20;

function todayString() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default {
  props: {
    navParams: { type: Object, default: () => ({}) },
  },
  emits: ['navigate'],
  setup(props, { emit }) {
    const { ref, computed, watch, onMounted } = Vue;

    const blueprints = ref([]);
    const selectedBlueprintId = ref('');
    const recentLogs = ref([]);

    const newTrackerName = ref('');
    const newTrackerType = ref('mass');

    const entryValue = ref('');
    const entryUnit = ref('lbs');
    const entryDate = ref(todayString());

    const selectedBlueprint = computed(
      () => blueprints.value.find((b) => b.id === selectedBlueprintId.value) || null
    );

    async function loadRecentLogs() {
      if (!selectedBlueprintId.value) {
        recentLogs.value = [];
        return;
      }
      recentLogs.value = await getRecentLogsForBlueprint(selectedBlueprintId.value, 8);
    }

    onMounted(async () => {
      blueprints.value = await getAllMetricBlueprints();
      if (blueprints.value.length) {
        selectedBlueprintId.value = blueprints.value[0].id;
      }
      await loadRecentLogs();
    });

    watch(selectedBlueprintId, loadRecentLogs);

    // Default the entry unit to whichever unit matches the selected
    // blueprint's type, following the app's global preferred unit.
    watch(selectedBlueprint, (blueprint) => {
      if (!blueprint) return;
      entryUnit.value = blueprint.type === 'mass' ? settings.preferredUnit : settings.preferredLengthUnit;
    });

    function toggleEntryUnit() {
      if (!selectedBlueprint.value) return;
      if (selectedBlueprint.value.type === 'mass') {
        entryUnit.value = entryUnit.value === 'lbs' ? 'kg' : 'lbs';
      } else {
        entryUnit.value = entryUnit.value === 'in' ? 'cm' : 'in';
      }
    }

    async function addCustomTracker() {
      const name = newTrackerName.value.trim();
      if (!name) return;
      const blueprint = await createMetricBlueprint({ name, type: newTrackerType.value });
      blueprints.value.push(blueprint);
      selectedBlueprintId.value = blueprint.id;
      newTrackerName.value = '';
      newTrackerType.value = 'mass';
    }

    const canLog = computed(
      () => Boolean(selectedBlueprintId.value) && entryValue.value !== '' && Boolean(entryDate.value)
    );

    async function submitLogEntry() {
      if (!canLog.value) return;
      const valueEntered = parseFloat(entryValue.value);
      if (Number.isNaN(valueEntered)) return;
      await logMetric({
        blueprintId: selectedBlueprintId.value,
        date: entryDate.value,
        valueEntered,
        unit: entryUnit.value,
      });
      entryValue.value = '';
      await loadRecentLogs();
    }

    // The chart always renders in the app's global preferred unit for the
    // metric's dimension (mass or length), independent of whatever unit the
    // entry form's toggle pill happens to be set to right now.
    const chartPreferredUnit = computed(() => {
      if (!selectedBlueprint.value) return '';
      return selectedBlueprint.value.type === 'mass' ? settings.preferredUnit : settings.preferredLengthUnit;
    });

    const points = computed(() => {
      if (!selectedBlueprint.value || recentLogs.value.length === 0) return [];
      const type = selectedBlueprint.value.type;
      const values = recentLogs.value.map((log) => formatMetricValue(log.valueBaseline, type, chartPreferredUnit.value));
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;
      const usableWidth = CHART_WIDTH - PADDING * 2;
      const usableHeight = CHART_HEIGHT - PADDING * 2;
      const step = values.length > 1 ? usableWidth / (values.length - 1) : 0;
      return values.map((value, i) => ({
        x: PADDING + step * i,
        y: PADDING + usableHeight - ((value - min) / range) * usableHeight,
      }));
    });

    const polylinePoints = computed(() => points.value.map((p) => `${p.x},${p.y}`).join(' '));

    return {
      blueprints,
      selectedBlueprintId,
      selectedBlueprint,
      newTrackerName,
      newTrackerType,
      entryValue,
      entryUnit,
      entryDate,
      toggleEntryUnit,
      addCustomTracker,
      canLog,
      submitLogEntry,
      points,
      polylinePoints,
      chartPreferredUnit,
      CHART_WIDTH,
      CHART_HEIGHT,
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
        <h1 class="text-lg font-bold">Body Metrics</h1>
      </header>

      <main class="px-4 py-4 space-y-6">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <label class="text-sm text-slate-400 block">Add a custom tracker</label>
          <input
            v-model="newTrackerName"
            type="text"
            placeholder="Add Custom Tracker Name..."
            class="w-full rounded-xl bg-slate-800 border border-slate-700 px-4 py-3 text-base"
          />
          <div class="flex items-center gap-3">
            <div class="flex rounded-xl overflow-hidden border border-slate-700 flex-1">
              <button
                @click="newTrackerType = 'mass'"
                class="flex-1 h-11 text-sm font-semibold"
                :class="newTrackerType === 'mass' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'"
              >Mass</button>
              <button
                @click="newTrackerType = 'length'"
                class="flex-1 h-11 text-sm font-semibold"
                :class="newTrackerType === 'length' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'"
              >Length</button>
            </div>
            <button
              @click="addCustomTracker"
              :disabled="!newTrackerName.trim()"
              class="h-11 px-5 rounded-xl bg-emerald-500 text-slate-950 font-semibold disabled:opacity-30"
            >Add</button>
          </div>
        </div>

        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <label class="text-sm text-slate-400 block">Log an entry</label>
          <select
            v-model="selectedBlueprintId"
            class="w-full h-11 rounded-xl bg-slate-800 border border-slate-700 px-4 text-base"
          >
            <option v-for="blueprint in blueprints" :key="blueprint.id" :value="blueprint.id">{{ blueprint.name }}</option>
          </select>

          <div class="flex items-center gap-2">
            <input
              v-model="entryValue"
              inputmode="decimal"
              type="text"
              placeholder="Value"
              class="flex-1 min-w-0 h-11 rounded-lg bg-slate-800 border border-slate-700 px-3 text-center"
            />
            <button
              @click="toggleEntryUnit"
              class="w-16 h-11 flex-shrink-0 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold uppercase"
            >{{ entryUnit }}</button>
          </div>
          <div class="flex items-center gap-2">
            <input
              v-model="entryDate"
              type="date"
              class="flex-1 min-w-0 h-11 rounded-lg bg-slate-800 border border-slate-700 px-2 text-sm"
            />
            <button
              @click="submitLogEntry"
              :disabled="!canLog"
              aria-label="Log entry"
              class="w-11 h-11 flex-shrink-0 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center disabled:opacity-30"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </div>
        </div>

        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div class="text-sm text-slate-400 mb-2">
            {{ selectedBlueprint ? selectedBlueprint.name + ' trend (' + chartPreferredUnit + ')' : 'No metric selected' }}
          </div>
          <div v-if="points.length === 0" class="text-slate-500 text-sm py-8 text-center">No logged entries yet.</div>
          <svg v-else :viewBox="'0 0 ' + CHART_WIDTH + ' ' + CHART_HEIGHT" class="w-full h-auto">
            <polyline :points="polylinePoints" fill="none" stroke="#10b981" stroke-width="2" />
            <circle v-for="(point, i) in points" :key="i" :cx="point.x" :cy="point.y" r="4" fill="#10b981" />
          </svg>
        </div>
      </main>
    </div>
  `,
};
