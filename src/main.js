import './style.css';
import { createApp } from 'vue';
import App from './App.vue';
import { ensureMetricBlueprintsSeeded } from './shared/db.js';

// Top-level await in a module script: guarantees the default metric
// blueprints exist before any screen (including Body Metrics) can render.
await ensureMetricBlueprintsSeeded();

createApp(App).mount('#app');
