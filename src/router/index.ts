import { createRouter, createWebHistory } from 'vue-router';
import DashboardScreen from '../features/dashboard/DashboardScreen.vue';
import SettingsScreen from '../features/settings/SettingsScreen.vue';
import RoutineBuilderScreen from '../features/routines/RoutineBuilderScreen.vue';
import ShareRoutinesScreen from '../features/routines/ShareRoutinesScreen.vue';
import ActiveWorkoutScreen from '../features/workout/ActiveWorkoutScreen.vue';
import WorkoutHistoryScreen from '../features/history/WorkoutHistoryScreen.vue';
import WorkoutSessionDetailScreen from '../features/history/WorkoutSessionDetailScreen.vue';
import BodyMetricsScreen from '../features/body-metrics/BodyMetricsScreen.vue';
import ProgressChartScreen from '../features/progress/ProgressChartScreen.vue';

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardScreen },
    { path: '/settings', name: 'settings', component: SettingsScreen },
    { path: '/routines/new', name: 'routine-builder-new', component: RoutineBuilderScreen },
    { path: '/routines/:routineId/edit', name: 'routine-builder-edit', component: RoutineBuilderScreen },
    { path: '/share-routines', name: 'share-routines', component: ShareRoutinesScreen },
    { path: '/workout/:routineId', name: 'active-workout', component: ActiveWorkoutScreen },
    { path: '/history', name: 'workout-history', component: WorkoutHistoryScreen },
    // Legacy path registered before the real-session path so its more
    // specific 'legacy' literal segment can't be shadowed — vue-router
    // matches route records in registration order when path shapes could
    // otherwise overlap (see docs/edd-vue-router-routing.md correction).
    { path: '/history/legacy/:sessionDate/:routineId?', name: 'workout-session-detail-legacy', component: WorkoutSessionDetailScreen },
    { path: '/history/:sessionId', name: 'workout-session-detail', component: WorkoutSessionDetailScreen },
    { path: '/body-metrics', name: 'body-metrics', component: BodyMetricsScreen },
    { path: '/progress', name: 'progress-chart', component: ProgressChartScreen },
    { path: '/:pathMatch(.*)*', redirect: { name: 'dashboard' } },
  ],
});
