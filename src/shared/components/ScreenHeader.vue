<script setup lang="ts">
defineProps<{
  title: string;
}>();
const emit = defineEmits<{
  back: [];
}>();
</script>

<template>
  <header class="flex items-center gap-3 px-4 py-5 sticky top-0 bg-background/95 backdrop-blur border-b border-border z-10">
    <button @click="emit('back')" aria-label="Back" class="w-11 h-11 flex items-center justify-center rounded-full bg-surface-2 active:bg-surface-3">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
    <h1 class="text-lg font-bold">{{ title }}</h1>
  </header>
</template>
