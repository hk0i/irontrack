<script setup lang="ts">
import { BAND_SWATCH_BACKGROUND, THERABAND_COLORS } from '../band-colors';

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
     * The surface the picker sits on — SetRow's cards are `bg-surface`,
     * History's edit row is `bg-surface-2`. The selection ring's offset gap
     * must match it to read as a gap rather than a second ring.
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
      :title="color"
      :style="{ background: BAND_SWATCH_BACKGROUND[color] }"
      class="h-7 w-7 rounded-full border border-border-strong disabled:opacity-50"
      :class="[
        modelValue.includes(color) && 'ring-2 ring-primary ring-offset-2',
        variant === 'surface' ? 'ring-offset-surface' : 'ring-offset-surface-2',
      ]"
    ></button>
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
