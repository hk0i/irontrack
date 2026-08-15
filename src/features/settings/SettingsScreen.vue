<script setup lang="ts">
import { ref } from 'vue';
import { exportAllData, importAllData } from '../../shared/db';
import {
  settings,
  setPreferredUnit,
  setTheme,
  setWarmupRestSeconds,
  setRegularRestSeconds,
  type Theme,
} from '../../shared/store';
import type { WeightUnit } from '../../shared/db';
import ScreenHeader from '../../shared/components/ScreenHeader.vue';
import SegmentedToggle from '../../shared/components/SegmentedToggle.vue';
import type { NavParams, ScreenName } from '../../shared/types';

defineProps<{
  navParams?: NavParams;
}>();
const emit = defineEmits<{
  navigate: [screen: ScreenName, params?: NavParams];
}>();

const THEMES: { value: Theme; label: string }[] = [
  { value: 'irontrack', label: 'IronTrack' },
  { value: 'onebigfunction', label: 'onebigfunction' },
];

const UNITS: { value: WeightUnit; label: string }[] = [
  { value: 'lbs', label: 'LBs' },
  { value: 'kg', label: 'KGs' },
];

const importStatus = ref('');
const fileInput = ref<HTMLInputElement | null>(null);

async function doExport() {
  const payload = await exportAllData();
  const json = JSON.stringify(payload, null, 2);
  const filename = `irontrack-backup-${payload.exportedAt.slice(0, 10)}.json`;
  const file = new File([json], filename, { type: 'application/json' });

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'IronTrack Backup' });
      return;
    } catch (err) {
      // user cancelled or share failed — fall through to download fallback
    }
  }

  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function triggerImport() {
  fileInput.value?.click();
}

async function handleFileSelected(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    await importAllData(payload);
    importStatus.value = 'Import successful.';
  } catch (err) {
    importStatus.value = `Import failed: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    target.value = '';
  }
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground pb-10">
    <ScreenHeader title="Settings" @back="emit('navigate', 'dashboard')" />

    <main class="px-4 py-4 space-y-6">
      <div>
        <label class="text-sm text-foreground-muted mb-2 block">Color theme</label>
        <SegmentedToggle :options="THEMES" :model-value="settings.theme" @update:model-value="setTheme" />
      </div>

      <div>
        <label class="text-sm text-foreground-muted mb-2 block">Preferred weight unit</label>
        <SegmentedToggle :options="UNITS" :model-value="settings.preferredUnit" @update:model-value="setPreferredUnit" />
        <p class="text-xs text-foreground-faint mt-2">Only affects how numbers are displayed — your logged history is never rewritten.</p>
      </div>

      <div>
        <label class="text-sm text-foreground-muted mb-1 block">Warmup rest (seconds)</label>
        <input
          type="number"
          min="0"
          step="5"
          :value="settings.warmupRestSeconds"
          @change="setWarmupRestSeconds(Number(($event.target as HTMLInputElement).value) || settings.warmupRestSeconds)"
          class="w-full rounded-xl bg-surface border border-border px-4 py-3 text-base"
        />
        <p class="text-xs text-foreground-faint mt-2">Rest timer duration after logging a warmup exercise's set.</p>
      </div>

      <div>
        <label class="text-sm text-foreground-muted mb-1 block">Workout rest (seconds)</label>
        <input
          type="number"
          min="0"
          step="5"
          :value="settings.regularRestSeconds"
          @change="setRegularRestSeconds(Number(($event.target as HTMLInputElement).value) || settings.regularRestSeconds)"
          class="w-full rounded-xl bg-surface border border-border px-4 py-3 text-base"
        />
        <p class="text-xs text-foreground-faint mt-2">Rest timer duration after logging a regular exercise's set.</p>
      </div>

      <div class="space-y-2">
        <label class="text-sm text-foreground-muted block">Share Routines</label>
        <p class="text-xs text-foreground-faint">Export just your routines and exercises — no logged sets, workouts, or body-metric data.</p>
        <button @click="emit('navigate', 'share-routines')" class="w-full py-3 rounded-xl bg-surface border border-border font-semibold">
          Share Routines
        </button>
      </div>

      <div class="space-y-2">
        <label class="text-sm text-foreground-muted block">Cloud portability</label>
        <button @click="doExport" class="w-full py-3 rounded-xl bg-surface border border-border font-semibold">
          Export Backup File
        </button>
        <button @click="triggerImport" class="w-full py-3 rounded-xl bg-surface border border-border font-semibold">
          Import Data File
        </button>
        <input ref="fileInput" type="file" accept="application/json" class="hidden" @change="handleFileSelected" />
        <p v-if="importStatus" class="text-sm text-success">{{ importStatus }}</p>
      </div>
    </main>
  </div>
</template>
