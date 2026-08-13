import { ref, onUnmounted } from 'vue';

/**
 * Swipe-left-to-reveal for a list of cards (only one open at a time), e.g.
 * an Edit/Duplicate/Delete action panel behind a routine card. Raw Pointer
 * Events, window-level move/up listeners attached on pointerdown — same
 * approach as RoutineBuilderScreen's exercise drag-reorder. A move is only
 * claimed as a swipe once it's clearly more horizontal than vertical, so a
 * card's `touch-action: pan-y` can leave ordinary vertical scrolling to the
 * browser.
 *
 * Consumers wire `onPointerDown`/`transformFor` onto each card's root
 * element, and call `consumeTap()` at the top of that element's own click
 * handler — it returns true (and the click should be ignored) whenever the
 * pointer interaction was actually a swipe, or closed a different open card.
 */
export function useSwipeReveal(openWidthPx: number, options: { onSwipeStart?: () => void } = {}) {
  const openId = ref<string | null>(null);
  const offset = ref(0);
  const draggingId = ref<string | null>(null);

  let startX = 0;
  let startY = 0;
  let baseOffset = 0;
  let direction: 'horizontal' | 'vertical' | null = null;
  let consumedTap = false;

  function onPointerDown(event: PointerEvent, id: string) {
    draggingId.value = id;
    startX = event.clientX;
    startY = event.clientY;
    direction = null;
    consumedTap = false;
    if (openId.value && openId.value !== id) {
      // Closing another open card consumes this tap — it shouldn't also act.
      openId.value = null;
      consumedTap = true;
    }
    baseOffset = openId.value === id ? -openWidthPx : 0;
    offset.value = baseOffset;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(event: PointerEvent) {
    if (!draggingId.value) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!direction) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      if (direction === 'vertical') {
        onPointerUp();
        return;
      }
      consumedTap = true;
      options.onSwipeStart?.();
    }
    event.preventDefault();
    offset.value = Math.max(-openWidthPx, Math.min(0, baseOffset + dx));
  }

  function onPointerUp() {
    if (draggingId.value && direction === 'horizontal') {
      openId.value = offset.value < -openWidthPx / 2 ? draggingId.value : null;
    }
    draggingId.value = null;
    direction = null;
    offset.value = 0;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  onUnmounted(() => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  });

  /** Call at the top of a card's tap handler; true means swallow the tap. */
  function consumeTap(): boolean {
    if (consumedTap) {
      consumedTap = false;
      return true;
    }
    return false;
  }

  function close(id: string) {
    if (openId.value === id) openId.value = null;
  }

  function transformFor(id: string) {
    return {
      transform: 'translateX(' + (id === draggingId.value ? offset.value : openId.value === id ? -openWidthPx : 0) + 'px)',
      transition: id === draggingId.value ? 'none' : 'transform 150ms ease-out',
    };
  }

  return { openId, onPointerDown, consumeTap, close, transformFor };
}
