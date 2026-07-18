import './style.css';
import { createApp } from 'vue';
import App from './App.vue';
import { ensureMetricBlueprintsSeeded } from './shared/db.js';

// Top-level await in a module script: guarantees the default metric
// blueprints exist before any screen (including Body Metrics) can render.
await ensureMetricBlueprintsSeeded();

createApp(App).mount('#app');

if ('serviceWorker' in navigator) {
  // updateViaCache: 'none' stops the browser from serving sw.js itself out of
  // the HTTP cache when checking for updates — without this, a stale cached
  // copy of sw.js can make the browser think there's nothing new to install
  // even when the app has genuinely changed. registration.update() then
  // forces that check to happen immediately on every load, instead of
  // waiting on the browser's own (up to 24h) update heuristic.
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
    .then((registration) => registration.update())
    .catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
}
