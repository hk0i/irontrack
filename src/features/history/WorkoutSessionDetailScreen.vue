<script setup lang="ts">
import ScreenHeader from '../../shared/components/ScreenHeader.vue';
import type { NavParams, ScreenName } from '../../shared/types';

const props = defineProps<{
  navParams?: NavParams;
}>();
const emit = defineEmits<{
  navigate: [screen: ScreenName, params?: NavParams];
}>();
</script>

<template>
  <div class="min-h-screen bg-background text-foreground pb-10">
    <ScreenHeader title="Workout Detail" @back="emit('navigate', 'workout-history')" />

    <main class="px-4 py-4">
      <p class="text-sm text-foreground-muted">
        sessionId: {{ props.navParams?.sessionId || 'none' }}<br />
        sessionDate: {{ props.navParams?.sessionDate || 'none' }}<br />
        routineId: {{ props.navParams?.routineId || 'none' }}
      </p>
    </main>
  </div>
</template>
