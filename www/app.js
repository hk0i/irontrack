import Dashboard from './components/dashboard.js';
import RoutineBuilder from './components/routine-builder.js';
import ActiveWorkout from './components/active-workout.js';
import ProgressChart from './components/progress-chart.js';
import Settings from './components/settings.js';

const screens = {
  dashboard: Dashboard,
  'routine-builder': RoutineBuilder,
  'active-workout': ActiveWorkout,
  'progress-chart': ProgressChart,
  settings: Settings,
};

const App = {
  components: screens,
  setup() {
    const { ref, shallowRef } = Vue;
    const currentScreen = ref('dashboard');
    const navParams = shallowRef({});

    function navigate(screen, params = {}) {
      currentScreen.value = screen;
      navParams.value = params;
    }

    return { currentScreen, navParams, navigate };
  },
  template: `
    <component
      :is="currentScreen"
      :nav-params="navParams"
      @navigate="navigate"
    />
  `,
};

Vue.createApp(App).mount('#app');

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => {
    console.warn('Service worker registration failed:', err);
  });
}
