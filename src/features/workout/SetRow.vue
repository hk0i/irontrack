<script setup>
// Weight/unit/reps/checkmark group shared by both the standalone-exercise
// case and both sides of a superset pair — previously duplicated three times
// across active-workout.js's template (see docs/edd-vue-sfc-migration.md
// step 5). Deliberately "dumb": it only knows about `row`'s own fields, not
// exerciseId/partnerRow/sessionId, so it emits intent and lets the parent
// (which already has that context) decide what checking/unlocking means.
defineProps({
  row: { type: Object, required: true },
  // Set index for a standalone exercise's row list; omitted (null) for
  // superset rows, which are labeled by exercise name above instead.
  index: { type: Number, default: null },
  // Superset rows sit in a narrower nested box, so their reps input and
  // row gap are slightly tighter than a standalone row's.
  compact: { type: Boolean, default: false },
});
const emit = defineEmits(['toggle-unit', 'check', 'unlock']);
</script>

<template>
  <div class="flex items-center" :class="compact ? 'gap-1.5' : 'gap-2'">
    <span v-if="index !== null" class="w-5 text-sm text-slate-500 text-center">{{ index + 1 }}</span>
    <input
      v-model="row.weightEntered"
      @input="row.weightInvalid = false"
      :disabled="row.checked"
      inputmode="decimal"
      type="text"
      placeholder="Weight"
      class="w-20 h-11 rounded-lg bg-slate-800 border px-2 text-center disabled:opacity-50"
      :class="row.weightInvalid ? 'border-rose-500' : 'border-slate-700'"
    />
    <button
      @click="emit('toggle-unit')"
      :disabled="row.checked"
      class="w-14 h-11 flex-shrink-0 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold uppercase disabled:opacity-50"
    >
      {{ row.unit }}
    </button>
    <input
      v-model="row.reps"
      @input="row.repsInvalid = false"
      @change="emit('check')"
      :disabled="row.checked"
      inputmode="numeric"
      type="text"
      placeholder="Reps"
      class="h-11 rounded-lg bg-slate-800 border px-2 text-center disabled:opacity-50"
      :class="[compact ? 'w-14' : 'w-16', row.repsInvalid ? 'border-rose-500' : 'border-slate-700']"
    />
    <button
      @click="row.checked ? emit('unlock') : emit('check')"
      :aria-label="row.checked ? 'Edit set' : 'Log set'"
      class="w-11 h-11 rounded-lg border-2 flex items-center justify-center flex-shrink-0"
      :class="row.checked ? 'bg-emerald-500 border-emerald-500 text-slate-950' : 'border-slate-700'"
    >
      <span v-if="row.checked">&#10003;</span>
    </button>
  </div>
</template>
