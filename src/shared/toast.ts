/**
 * General-purpose toast queue — any feature that wants to surface a
 * dismissible, optionally-actionable message imports showToast/dismissToast
 * directly; no new component per use case. ToastHost.vue is the one place
 * that renders whatever's currently queued here.
 */

import { reactive } from 'vue';

export interface ToastItem {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /**
   * Omitted: the toast persists until manually dismissed or its action is
   * taken. Given: auto-dismisses after that many ms.
   */
  duration?: number;
}

export const toasts: ToastItem[] = reactive([]);

const autoDismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function showToast(options: Omit<ToastItem, 'id'>): string {
  const id = crypto.randomUUID();
  toasts.push({ id, ...options });
  if (options.duration) {
    autoDismissTimers.set(
      id,
      setTimeout(() => dismissToast(id), options.duration)
    );
  }
  return id;
}

export function dismissToast(id: string): void {
  const index = toasts.findIndex((t) => t.id === id);
  if (index !== -1) toasts.splice(index, 1);
  const timer = autoDismissTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    autoDismissTimers.delete(id);
  }
}
