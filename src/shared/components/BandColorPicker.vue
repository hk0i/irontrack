<script setup lang="ts">
import { THERABAND_COLORS } from '../band-colors';

const props = withDefaults(
  defineProps<{
    modelValue: string[];
    disabled?: boolean;
    /**
     * Reset button is only useful where there's no other way to discard a
     * band selection (SetRow, mid-entry) — History's edit form already has
     * an explicit Cancel button, so it turns this off.
     */
    showReset?: boolean;
    /**
     * The chip's inactive background needs to contrast with whatever
     * surface it sits on — SetRow's cards are `bg-surface`, History's edit
     * row is `bg-surface-2`, so each picks the other for its "off" chips.
     */
    variant?: 'surface' | 'surface-2';
  }>(),
  { disabled: false, showReset: true, variant: 'surface-2' }
);
const emit = defineEmits<{
  'update:modelValue': [colors: string[]];
}>();

function toggle(color: string) {
  const next = props.modelValue.includes(color) ? props.modelValue.filter((c) => c !== color) : [...props.modelValue, color];
  emit('update:modelValue', next);
}
</script>

<template>
  <div class="flex flex-wrap gap-1">
    <button
      v-for="color in THERABAND_COLORS"
      :key="color"
      @click="toggle(color)"
      :disabled="disabled"
      :aria-label="color + ' band'"
      :aria-pressed="modelValue.includes(color)"
      class="px-2 h-7 rounded-full border text-[10px] font-semibold disabled:opacity-50"
      :class="
        modelValue.includes(color)
          ? 'bg-primary border-primary text-on-primary'
          : variant === 'surface'
            ? 'bg-surface border-border-strong text-foreground-subtle'
            : 'bg-surface-2 border-border-strong text-foreground-subtle'
      "
    >
      {{ color }}
    </button>
    <button
      v-if="showReset && modelValue.length"
      @click="emit('update:modelValue', [])"
      :disabled="disabled"
      aria-label="Clear band selection"
      class="px-2 h-7 rounded-full border border-border-strong text-[10px] font-semibold text-foreground-muted disabled:opacity-50"
    >
      Reset
    </button>
  </div>
</template>
