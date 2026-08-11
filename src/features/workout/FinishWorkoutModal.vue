<script setup lang="ts">
import { ref } from 'vue';
import { MOOD_PRESETS } from '../../shared/moods';

const emit = defineEmits<{
  finish: [payload: { mood?: string; note?: string }];
  cancel: [];
}>();

const mood = ref('');
const note = ref('');

function handleFinish() {
  emit('finish', {
    mood: mood.value.trim() || undefined,
    note: note.value.trim() || undefined,
  });
}
</script>

<template>
  <div @click.self="emit('cancel')" class="fixed inset-0 bg-overlay/60 flex items-center justify-center px-6">
    <div class="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm">
      <h2 class="font-semibold text-base mb-1">How'd it go?</h2>
      <p class="text-xs text-foreground-muted mb-4">Both fields are optional.</p>

      <div class="flex gap-2 mb-3">
        <button
          v-for="preset in MOOD_PRESETS"
          :key="preset"
          type="button"
          @click="mood = preset"
          :aria-pressed="mood === preset"
          class="w-11 h-11 shrink-0 rounded-xl border text-xl flex items-center justify-center"
          :class="mood === preset ? 'bg-primary border-primary' : 'bg-surface-2 border-border-strong'"
        >
          {{ preset }}
        </button>
        <input
          v-model="mood"
          type="text"
          maxlength="8"
          placeholder="or type your own"
          aria-label="Custom mood emoji"
          class="flex-1 min-w-0 h-11 px-3 rounded-xl border border-border-strong bg-surface-2 text-sm text-foreground"
        />
      </div>

      <textarea
        v-model="note"
        rows="3"
        placeholder="Notes — how did it feel, anything worth remembering?"
        class="w-full px-3 py-2 rounded-xl border border-border-strong bg-surface-2 text-sm text-foreground mb-4 resize-none"
      ></textarea>

      <button @click="handleFinish" class="w-full py-3 rounded-xl bg-primary text-on-primary font-semibold text-base active:bg-primary-bright">
        Finish Workout
      </button>
    </div>
  </div>
</template>
