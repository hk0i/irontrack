<script setup lang="ts">
// Icon-only button chrome, in the two size/tone combinations already used
// across the app. aria-label and @click aren't declared as props/emits —
// Vue's attribute/listener fallthrough puts them straight on the <button>
// root, so callers use this exactly like a native <button>. The icon SVG
// itself is caller-supplied via the default slot, since every use has a
// different icon.
withDefaults(
  defineProps<{
    size?: 'sm' | 'md';
    tone?: 'default' | 'danger' | 'success';
  }>(),
  { size: 'md', tone: 'default' }
);

const VARIANT_CLASSES: Record<string, string> = {
  'md-default': 'w-11 h-11 rounded-full bg-surface-2 active:bg-surface-3',
  'md-danger': 'w-11 h-11 rounded-full bg-danger/15 text-danger active:bg-danger/25',
  'md-success': 'w-11 h-11 rounded-full bg-success/15 text-success active:bg-success/25',
  'sm-default': 'w-7 h-7 flex-shrink-0 rounded-md text-secondary active:bg-surface-3',
  'sm-danger': 'w-7 h-7 flex-shrink-0 rounded-md text-danger active:bg-surface-3',
  'sm-success': 'w-7 h-7 flex-shrink-0 rounded-md text-success active:bg-surface-3',
};
</script>

<template>
  <button :class="['flex items-center justify-center', VARIANT_CLASSES[`${size}-${tone}`]]">
    <slot />
  </button>
</template>
