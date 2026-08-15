<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    tone?: 'neutral' | 'pr';
  }>(),
  { tone: 'neutral' },
);

const TONE_CLASSES: Record<string, string> = {
  neutral: 'bg-surface-2 text-foreground-subtle',
  pr: 'bg-primary/10 text-primary-bright',
};
</script>

<template>
  <span :class="['text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap', TONE_CLASSES[tone]]">
    {{ label }}
  </span>
</template>
