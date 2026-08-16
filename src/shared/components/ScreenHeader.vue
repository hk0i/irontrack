<script setup lang="ts">
import { useRouter, type RouteLocationRaw } from 'vue-router';
import IconButton from './IconButton.vue';

const props = defineProps<{
  title: string;
  fallback?: RouteLocationRaw;
}>();
const router = useRouter();

function goBack(): void {
  // history.state.back is set by vue-router's HTML5 history on every push;
  // null only on a fresh/deep-linked load with no in-app predecessor.
  if (window.history.state?.back) {
    router.back();
  } else {
    router.replace(props.fallback ?? { name: 'dashboard' });
  }
}
</script>

<template>
  <header class="flex items-center gap-3 px-4 py-5 sticky top-0 bg-background/95 backdrop-blur border-b border-border z-10">
    <IconButton @click="goBack" aria-label="Back">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
    </IconButton>
    <h1 class="text-lg font-bold">{{ title }}</h1>
  </header>
</template>
