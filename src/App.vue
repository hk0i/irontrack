<script setup>
import { ref } from 'vue';
import SettingsScreen from './features/settings/SettingsScreen.vue';

// Minimal host for step 3's proof-of-concept conversion — no real
// screen-switching yet (that returns once more screens are converted).
// Just proves a real .vue screen renders and its @navigate emit round-trips
// correctly. See docs/edd-vue-sfc-migration.md step 3.
const lastNavigation = ref('(none yet)');

function onNavigate(screen, params = {}) {
  lastNavigation.value = `${screen} ${JSON.stringify(params)}`;
}
</script>

<template>
  <div>
    <SettingsScreen :nav-params="{}" @navigate="onNavigate" />
    <div class="fixed bottom-0 inset-x-0 bg-slate-800 text-slate-100 text-xs p-2 text-center">
      Last navigate() call: {{ lastNavigation }}
    </div>
  </div>
</template>
