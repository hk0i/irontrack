<script setup>
import { ref, shallowRef } from 'vue';
import DashboardScreen from './features/dashboard/DashboardScreen.vue';
import SettingsScreen from './features/settings/SettingsScreen.vue';
import RoutineBuilderScreen from './features/routines/RoutineBuilderScreen.vue';
import ActiveWorkoutScreen from './features/workout/ActiveWorkoutScreen.vue';
import WorkoutHistoryScreen from './features/history/WorkoutHistoryScreen.vue';
import BodyMetricsScreen from './features/body-metrics/BodyMetricsScreen.vue';

// Screens not yet converted from the old www/ app fall through to the
// "not yet converted" placeholder below — added to this map as each one
// lands. See docs/edd-vue-sfc-migration.md step 4.
const screens = {
  dashboard: DashboardScreen,
  settings: SettingsScreen,
  'routine-builder': RoutineBuilderScreen,
  'active-workout': ActiveWorkoutScreen,
  'workout-history': WorkoutHistoryScreen,
  'body-metrics': BodyMetricsScreen,
};

const currentScreen = ref('dashboard');
const navParams = shallowRef({});

function navigate(screen, params = {}) {
  currentScreen.value = screen;
  navParams.value = params;
}
</script>

<template>
  <component
    v-if="screens[currentScreen]"
    :is="screens[currentScreen]"
    :nav-params="navParams"
    @navigate="navigate"
  />
  <div v-else class="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4 px-6 text-center">
    <p class="text-slate-300">"{{ currentScreen }}" hasn't been converted yet.</p>
    <button @click="navigate('dashboard')" class="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 font-semibold">Back to Dashboard</button>
  </div>
</template>
