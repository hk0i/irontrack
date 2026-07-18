<script setup>
import { ref, shallowRef } from 'vue';
import DashboardScreen from './features/dashboard/DashboardScreen.vue';
import SettingsScreen from './features/settings/SettingsScreen.vue';
import RoutineBuilderScreen from './features/routines/RoutineBuilderScreen.vue';
import ActiveWorkoutScreen from './features/workout/ActiveWorkoutScreen.vue';
import WorkoutHistoryScreen from './features/history/WorkoutHistoryScreen.vue';
import BodyMetricsScreen from './features/body-metrics/BodyMetricsScreen.vue';
import ProgressChartScreen from './features/progress/ProgressChartScreen.vue';

const screens = {
  dashboard: DashboardScreen,
  settings: SettingsScreen,
  'routine-builder': RoutineBuilderScreen,
  'active-workout': ActiveWorkoutScreen,
  'workout-history': WorkoutHistoryScreen,
  'body-metrics': BodyMetricsScreen,
  'progress-chart': ProgressChartScreen,
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
    :is="screens[currentScreen]"
    :nav-params="navParams"
    @navigate="navigate"
  />
</template>
