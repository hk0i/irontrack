<script setup lang="ts">
import { reactive } from 'vue';
import type { Exercise, Routine, RoutineImportConflict } from '../db';

const props = defineProps<{
  routineConflicts: RoutineImportConflict<Routine>[];
  exerciseConflicts: RoutineImportConflict<Exercise>[];
}>();
const emit = defineEmits<{
  confirm: [resolutions: Map<string, 'overwrite' | 'copy'>];
  cancel: [];
}>();

// Defaults to 'copy' for every conflict — matches importRoutines' own default,
// so an item left untouched by the user still never silently overwrites
// local data.
const choices = reactive(
  new Map<string, 'overwrite' | 'copy'>([
    ...props.routineConflicts.map((c) => [c.incoming.id, 'copy' as const] as const),
    ...props.exerciseConflicts.map((c) => [c.incoming.id, 'copy' as const] as const),
  ])
);

function setChoice(id: string, choice: 'overwrite' | 'copy') {
  choices.set(id, choice);
}

function confirm() {
  emit('confirm', new Map(choices));
}
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50">
    <div class="bg-background w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-y-auto p-4 space-y-4">
      <h2 class="text-lg font-bold">Resolve conflicts</h2>
      <p class="text-sm text-foreground-muted">
        These items already exist locally under a different name. Choose whether to overwrite the local copy or keep both.
      </p>

      <ul class="space-y-3">
        <li
          v-for="conflict in routineConflicts"
          :key="'routine-' + conflict.incoming.id"
          class="rounded-xl border border-border p-3 space-y-2"
        >
          <div class="text-sm">
            <span class="text-foreground-muted">Routine:</span>
            <span class="font-semibold">{{ conflict.existing.name }}</span>
            <span class="text-foreground-muted"> → </span>
            <span class="font-semibold">{{ conflict.incoming.name }}</span>
          </div>
          <div class="flex gap-2">
            <button
              @click="setChoice(conflict.incoming.id, 'copy')"
              :class="[
                'flex-1 py-2 rounded-lg text-sm font-semibold border',
                choices.get(conflict.incoming.id) === 'copy' ? 'bg-primary-bright text-white border-primary-bright' : 'bg-surface border-border',
              ]"
            >
              Keep Both
            </button>
            <button
              @click="setChoice(conflict.incoming.id, 'overwrite')"
              :class="[
                'flex-1 py-2 rounded-lg text-sm font-semibold border',
                choices.get(conflict.incoming.id) === 'overwrite' ? 'bg-danger text-white border-danger' : 'bg-surface border-border',
              ]"
            >
              Overwrite
            </button>
          </div>
        </li>

        <li
          v-for="conflict in exerciseConflicts"
          :key="'exercise-' + conflict.incoming.id"
          class="rounded-xl border border-border p-3 space-y-2"
        >
          <div class="text-sm">
            <span class="text-foreground-muted">Exercise:</span>
            <span class="font-semibold">{{ conflict.existing.name }}</span>
            <span class="text-foreground-muted"> → </span>
            <span class="font-semibold">{{ conflict.incoming.name }}</span>
          </div>
          <div class="flex gap-2">
            <button
              @click="setChoice(conflict.incoming.id, 'copy')"
              :class="[
                'flex-1 py-2 rounded-lg text-sm font-semibold border',
                choices.get(conflict.incoming.id) === 'copy' ? 'bg-primary-bright text-white border-primary-bright' : 'bg-surface border-border',
              ]"
            >
              Keep Both
            </button>
            <button
              @click="setChoice(conflict.incoming.id, 'overwrite')"
              :class="[
                'flex-1 py-2 rounded-lg text-sm font-semibold border',
                choices.get(conflict.incoming.id) === 'overwrite' ? 'bg-danger text-white border-danger' : 'bg-surface border-border',
              ]"
            >
              Overwrite
            </button>
          </div>
        </li>
      </ul>

      <div class="flex gap-2 pt-2">
        <button @click="emit('cancel')" class="flex-1 py-3 rounded-xl bg-surface border border-border font-semibold">
          Cancel
        </button>
        <button @click="confirm" class="flex-1 py-3 rounded-xl bg-primary-bright text-white font-semibold">
          Confirm Import
        </button>
      </div>
    </div>
  </div>
</template>
