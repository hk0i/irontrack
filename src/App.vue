<script setup>
import { ref } from 'vue';

// Placeholder only — proves Vite + @vitejs/plugin-vue (SFC compilation) and
// @tailwindcss/vite (the emerald classes below) both work end to end. No
// real screens live here yet; see docs/edd-vue-sfc-migration.md step 1.
const message = ref('Vite scaffold is working');
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
    <p class="text-emerald-400 font-bold text-xl">{{ message }}</p>
  </div>
</template>
