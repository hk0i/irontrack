<script setup>
import { ref, onMounted } from 'vue';
import { getAllRoutines } from './shared/db.js';
import { settings } from './shared/store.js';

// Placeholder only — proves Vite + @vitejs/plugin-vue (SFC compilation),
// @tailwindcss/vite (the emerald classes below), and the relocated
// src/shared/db.js (real `import Dexie from 'dexie'` instead of a global)
// all work end to end. No real screens live here yet; see
// docs/edd-vue-sfc-migration.md step 2.
const message = ref('Vite scaffold is working');
const routineCount = ref(null);

onMounted(async () => {
  const routines = await getAllRoutines();
  routineCount.value = routines.length;
});
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-2">
    <p class="text-emerald-400 font-bold text-xl">{{ message }}</p>
    <p class="text-slate-400 text-sm">
      shared/db.js connected — {{ routineCount === null ? 'loading…' : `${routineCount} routines in this origin's IndexedDB` }}
    </p>
    <p class="text-slate-400 text-sm">shared/store.js connected — preferred unit: {{ settings.preferredUnit }}</p>
  </div>
</template>
