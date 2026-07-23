<script setup lang="ts">
// Weight/unit/reps/checkmark group shared by both the standalone-exercise
// case and both sides of a superset pair — previously duplicated three times
// across active-workout.js's template (see docs/edd-vue-sfc-migration.md
// step 5). Deliberately "dumb": it only knows about `row`'s own fields, not
// exerciseId/partnerRow/sessionId, so it emits intent and lets the parent
// (which already has that context) decide what checking/unlocking means.
import { computed } from 'vue';
import type { SetRowState } from '../../shared/types';
import type { ResistanceType } from '../../shared/db';
import { THERABAND_COLORS } from '../../shared/band-colors';

const props = withDefaults(
  defineProps<{
    row: SetRowState;
    // Set index for a standalone exercise's row list; omitted (null) for
    // superset rows, which are labeled by exercise name above instead.
    index?: number | null;
    // Superset rows sit in a narrower nested box, so their reps input and
    // row gap are slightly tighter than a standalone row's.
    compact?: boolean;
    // Comes from the exercise, not the row — weight input/unit pill only
    // render for 'weight', band chips only for 'bands', neither for
    // 'bodyweight' (just reps + checkmark).
    resistanceType?: ResistanceType;
    // Only the trailing row of a set list is ever removable — set by the
    // parent, which knows the row's position. Removing a non-trailing row
    // would desync a superset pair's index-paired arrays, so that's not
    // offered at all rather than handled riskily.
    removable?: boolean;
  }>(),
  { index: null, compact: false, resistanceType: 'weight', removable: false }
);
const emit = defineEmits<{
  'toggle-unit': [];
  check: [];
  unlock: [];
  remove: [];
}>();

// A row is only removable once it's also empty — untouched since
// makeEmptyRow() created it. Prevents the X from ever discarding
// weight/reps/bands the user actually entered.
const isEmpty = computed(
  () => !props.row.checked && props.row.weightEntered === '' && props.row.reps === '' && props.row.bandColors.length === 0
);

function toggleBandColor(color: string) {
  const i = props.row.bandColors.indexOf(color);
  if (i === -1) props.row.bandColors.push(color);
  else props.row.bandColors.splice(i, 1);
}

function resetBandColors() {
  props.row.bandColors.splice(0, props.row.bandColors.length);
}
</script>

<template>
  <div class="flex items-center flex-wrap" :class="compact ? 'gap-1.5' : 'gap-2'">
    <span v-if="index !== null" class="w-5 text-sm text-foreground-faint text-center">{{ index + 1 }}</span>

    <template v-if="resistanceType === 'weight'">
      <input
        v-model="row.weightEntered"
        @input="row.weightInvalid = false"
        :disabled="row.checked"
        inputmode="decimal"
        type="text"
        placeholder="Weight"
        class="w-20 h-11 rounded-lg bg-surface-2 border px-2 text-center disabled:opacity-50"
        :class="row.weightInvalid ? 'border-danger' : 'border-border-strong'"
      />
      <button
        @click="emit('toggle-unit')"
        :disabled="row.checked"
        class="w-14 h-11 flex-shrink-0 rounded-full bg-surface-2 border border-border-strong text-xs font-semibold uppercase disabled:opacity-50"
      >
        {{ row.unit }}
      </button>
    </template>

    <div v-else-if="resistanceType === 'bands'" class="flex flex-wrap gap-1 max-w-[220px]">
      <button
        v-for="color in THERABAND_COLORS"
        :key="color"
        @click="toggleBandColor(color)"
        :disabled="row.checked"
        :aria-label="color + ' band'"
        :aria-pressed="row.bandColors.includes(color)"
        class="px-2 h-7 rounded-full border text-[10px] font-semibold disabled:opacity-50"
        :class="row.bandColors.includes(color) ? 'bg-accent border-accent text-on-accent' : 'bg-surface-2 border-border-strong text-foreground-subtle'"
      >
        {{ color }}
      </button>
      <button
        v-if="row.bandColors.length"
        @click="resetBandColors"
        :disabled="row.checked"
        aria-label="Clear band selection"
        class="px-2 h-7 rounded-full border border-border-strong text-[10px] font-semibold text-foreground-muted disabled:opacity-50"
      >
        Reset
      </button>
    </div>

    <input
      v-model="row.reps"
      @input="row.repsInvalid = false"
      @change="emit('check')"
      :disabled="row.checked"
      inputmode="numeric"
      type="text"
      placeholder="Reps"
      class="h-11 rounded-lg bg-surface-2 border px-2 text-center disabled:opacity-50"
      :class="[compact ? 'w-14' : 'w-16', row.repsInvalid ? 'border-danger' : 'border-border-strong']"
    />
    <button
      @click="row.checked ? emit('unlock') : emit('check')"
      :aria-label="row.checked ? 'Edit set' : 'Log set'"
      class="w-11 h-11 rounded-lg border-2 flex items-center justify-center flex-shrink-0"
      :class="row.checked ? 'bg-accent border-accent text-on-accent' : 'border-border-strong'"
    >
      <span v-if="row.checked">&#10003;</span>
    </button>
    <button
      v-if="removable && isEmpty"
      @click="emit('remove')"
      aria-label="Remove empty set"
      class="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full bg-surface-2 text-foreground-muted text-sm"
    >
      &times;
    </button>
  </div>
</template>
