<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { exportRoutines, getAllRoutines, type Routine } from '../../shared/db';
import ScreenHeader from '../../shared/components/ScreenHeader.vue';
import type { NavParams, ScreenName } from '../../shared/types';

defineProps<{
  navParams?: NavParams;
}>();
const emit = defineEmits<{
  navigate: [screen: ScreenName, params?: NavParams];
}>();

const routines = ref<Routine[]>([]);
const selectedIds = ref<Set<string>>(new Set());

onMounted(async () => {
  routines.value = await getAllRoutines();
  selectedIds.value = new Set(routines.value.map((r) => r.id));
});

function toggle(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function selectAll() {
  selectedIds.value = new Set(routines.value.map((r) => r.id));
}

function selectNone() {
  selectedIds.value = new Set();
}

async function shareSelected() {
  const payload = await exportRoutines([...selectedIds.value]);
  const json = JSON.stringify(payload, null, 2);
  const filename = `irontrack-routines-${payload.exportedAt.slice(0, 10)}.json`;
  const file = new File([json], filename, { type: 'application/json' });

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'IronTrack Routines' });
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
</script>

<template>
  <div class="min-h-screen bg-background text-foreground pb-10">
    <ScreenHeader title="Share Routines" @back="emit('navigate', 'settings')" />

    <main class="px-4 py-4 space-y-4">
      <p class="text-sm text-foreground-muted">
        Shares only the selected routines and their exercises — no logged sets, workouts, or body-metric data.
      </p>

      <div v-if="routines.length" class="flex gap-2">
        <button @click="selectAll" class="flex-1 py-2 rounded-xl bg-surface border border-border text-sm font-semibold">
          Select All
        </button>
        <button @click="selectNone" class="flex-1 py-2 rounded-xl bg-surface border border-border text-sm font-semibold">
          Select None
        </button>
      </div>

      <ul v-if="routines.length" class="space-y-2">
        <li v-for="routine in routines" :key="routine.id">
          <label class="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-border">
            <input
              type="checkbox"
              class="w-5 h-5 accent-primary-bright flex-shrink-0"
              :checked="selectedIds.has(routine.id)"
              @change="toggle(routine.id)"
            />
            <span class="flex-1">
              <span class="block font-semibold">{{ routine.name }}</span>
              <span class="block text-xs text-foreground-muted">{{ routine.exerciseIds.length }} exercises</span>
            </span>
          </label>
        </li>
      </ul>

      <p v-else class="text-sm text-foreground-muted">No routines yet — build one first.</p>

      <button
        @click="shareSelected"
        :disabled="selectedIds.size === 0"
        class="w-full py-3 rounded-xl bg-surface border border-border font-semibold disabled:opacity-50"
      >
        Share Selected ({{ selectedIds.size }})
      </button>
    </main>
  </div>
</template>
