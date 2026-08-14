import { ref, onUnmounted, type Ref } from 'vue';

/**
 * Vertical drag-to-reorder for a list bound to a dedicated per-row handle
 * (not the row itself — the row usually has its own tap behavior). Raw
 * Pointer Events: `pointerdown` on the handle attaches window-level
 * `pointermove`/`pointerup`, splicing `items` live so the list visually
 * reorders as you drag, then re-basing the drag origin so the pointer
 * stays anchored to the row it grabbed.
 *
 * `gap`/`fallbackHeight` should match the list's actual row height and
 * `space-y-*` gap — they're used to convert pixel offset into "how many
 * rows have I dragged past."
 */
export function useDragReorder<T>(
  items: Ref<T[]>,
  options: { gap?: number; fallbackHeight?: number; onDrop?: () => void } = {}
) {
  const gap = options.gap ?? 8;
  const fallbackHeight = options.fallbackHeight ?? 56;

  const draggingIndex = ref<number | null>(null);
  const dragOffset = ref(0);
  const rowEls: (HTMLElement | null)[] = [];
  let pointerStartY = 0;
  let rowStep = 0;

  function setRowEl(index: number, el: HTMLElement | null) {
    rowEls[index] = el;
  }

  function onRowPointerDown(event: PointerEvent, index: number) {
    event.preventDefault();
    draggingIndex.value = index;
    dragOffset.value = 0;
    pointerStartY = event.clientY;
    const rect = rowEls[index]?.getBoundingClientRect();
    rowStep = (rect?.height || fallbackHeight) + gap;
    window.addEventListener('pointermove', onRowPointerMove);
    window.addEventListener('pointerup', onRowPointerUp);
  }

  function onRowPointerMove(event: PointerEvent) {
    if (draggingIndex.value === null) return;
    dragOffset.value = event.clientY - pointerStartY;
    const from = draggingIndex.value;
    const maxIndex = items.value.length - 1;
    let to = from + Math.round(dragOffset.value / rowStep);
    to = Math.max(0, Math.min(maxIndex, to));
    if (to !== from) {
      const arr = items.value;
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      pointerStartY += (to - from) * rowStep;
      dragOffset.value = event.clientY - pointerStartY;
      draggingIndex.value = to;
    }
  }

  function onRowPointerUp() {
    draggingIndex.value = null;
    dragOffset.value = 0;
    window.removeEventListener('pointermove', onRowPointerMove);
    window.removeEventListener('pointerup', onRowPointerUp);
    options.onDrop?.();
  }

  onUnmounted(() => {
    window.removeEventListener('pointermove', onRowPointerMove);
    window.removeEventListener('pointerup', onRowPointerUp);
  });

  return { draggingIndex, dragOffset, setRowEl, onRowPointerDown };
}
