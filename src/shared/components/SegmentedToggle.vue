<script setup lang="ts" generic="T extends string">
defineProps<{
  options: { value: T; label: string }[];
  modelValue: T;
  // 'md' reproduces the Settings screen's toggles (py-3 font-semibold);
  // 'sm' reproduces the resistance-type picker's smaller size (py-2
  // text-xs font-semibold).
  size?: 'sm' | 'md';
}>();
const emit = defineEmits<{
  'update:modelValue': [value: T];
}>();
</script>

<template>
  <div class="flex rounded-xl overflow-hidden border border-border">
    <button
      v-for="option in options"
      :key="option.value"
      @click="emit('update:modelValue', option.value)"
      :class="[
        size === 'sm' ? 'py-2 text-xs font-semibold' : 'py-3 font-semibold',
        'flex-1',
        modelValue === option.value ? 'bg-primary text-on-primary' : 'bg-surface text-foreground-subtle',
      ]"
    >
      {{ option.label }}
    </button>
  </div>
</template>
