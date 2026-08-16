<script setup lang="ts">
import { RouterView } from 'vue-router';
import RestTimerBanner from './shared/components/RestTimerBanner.vue';
import ToastHost from './shared/components/ToastHost.vue';
</script>

<template>
  <router-view v-slot="{ Component, route }">
    <component :is="Component" :key="route.fullPath" />
  </router-view>
  <RestTimerBanner />
  <ToastHost />
</template>
