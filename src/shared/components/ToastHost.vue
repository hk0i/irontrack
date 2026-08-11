<script setup lang="ts">
/**
 * Mounted once, app-wide, in App.vue (alongside RestTimerBanner) — renders
 * whatever's currently queued in toast.ts. Purely generic/presentational:
 * knows nothing about what pushed a given toast or why.
 */
import { toasts, dismissToast, type ToastItem } from '../toast';

function runAction(toast: ToastItem) {
  toast.onAction?.();
  dismissToast(toast.id);
}
</script>

<template>
  <div class="fixed inset-x-0 bottom-4 px-4 flex flex-col items-center gap-2 z-20 pointer-events-none">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="pointer-events-auto w-full max-w-sm bg-surface text-foreground border border-border rounded-2xl px-4 py-3 shadow-lg flex items-center gap-3"
    >
      <span class="flex-1 text-sm">{{ toast.message }}</span>
      <button
        v-if="toast.actionLabel"
        @click="runAction(toast)"
        class="px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-semibold whitespace-nowrap active:bg-primary-bright"
      >
        {{ toast.actionLabel }}
      </button>
      <button
        @click="dismissToast(toast.id)"
        aria-label="Dismiss"
        class="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full text-foreground-muted active:bg-surface-2 text-lg"
      >
        &times;
      </button>
    </div>
  </div>
</template>
