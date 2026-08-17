import './style.css';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { ensureMetricBlueprintsSeeded } from './shared/db';
import { initAppUpdateWatcher } from './shared/app-update.js';

// Top-level await in a module script: guarantees the default metric
// blueprints exist before any screen (including Body Metrics) can render.
await ensureMetricBlueprintsSeeded();

const app = createApp(App);
app.use(router);
await router.isReady();
app.mount('#app');

const ONE_HOUR_MS = 60 * 60 * 1000;
const UPDATE_CHECK_INTERVAL_MS = ONE_HOUR_MS;

if ('serviceWorker' in navigator) {
  // updateViaCache: 'none' stops the browser from serving sw.js itself out of
  // the HTTP cache when checking for updates — without this, a stale cached
  // copy of sw.js can make the browser think there's nothing new to install
  // even when the app has genuinely changed. registration.update() then
  // forces that check to happen immediately on every load, instead of
  // waiting on the browser's own (up to 24h) update heuristic.
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
    .then((registration) => {
      initAppUpdateWatcher(registration);
      registration.update();

      // A single check on load isn't enough — a long-lived open tab/PWA
      // session (never fully closed) would otherwise never notice a new
      // version. Re-checking periodically, plus the instant the tab
      // becomes visible again, catches that without waiting on the
      // browser's own infrequent background update heuristic.
      setInterval(() => registration.update(), UPDATE_CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) registration.update();
      });
    })
    .catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
}
