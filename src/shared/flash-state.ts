import { ref } from 'vue';

// One-shot UI cue (e.g. "jiggle this card"), not identity/resource state —
// deliberately kept out of the URL so a bookmarked/reopened link can't
// wrongly re-trigger it. Plain in-memory ref is fine: this only ever
// survives a same-runtime SPA navigation, never a full page reload.
const pendingHighlightRoutineId = ref<string | null>(null);

export function setHighlightRoutineId(id: string): void {
  pendingHighlightRoutineId.value = id;
}

export function consumeHighlightRoutineId(): string | null {
  const id = pendingHighlightRoutineId.value;
  pendingHighlightRoutineId.value = null;
  return id;
}
