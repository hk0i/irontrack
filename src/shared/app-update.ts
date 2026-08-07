// Tracks whether a new service-worker version is installed and waiting to
// take over (see src/sw.js — it deliberately no longer auto-activates).
// Plain per-page-load runtime state, no localStorage: a reload is the
// entire point of "installing" an update, so there's nothing here worth
// surviving one.

import { reactive } from 'vue';
import { showToast } from './toast';

export const appUpdate: { available: boolean } = reactive({ available: false });

let waitingWorker: ServiceWorker | null = null;

// Guards the toast to once per update — if a second version somehow
// becomes available before the first is installed, waitingWorker is still
// kept current (installAppUpdate always targets whichever worker is
// actually waiting), it just doesn't queue a second toast on top.
function markAvailable(worker: ServiceWorker) {
  waitingWorker = worker;
  if (appUpdate.available) return;
  appUpdate.available = true;
  showToast({
    message: 'A new version is available.',
    actionLabel: 'Update now',
    onAction: installAppUpdate,
  });
}

// A worker reaching 'installed' only means "a new version is ready" when
// there's already a controller — on a first-ever visit (no prior service
// worker), the very first install also passes through 'installed' with no
// existing controller, and that's not an "update", just normal startup.
function trackInstalling(worker: ServiceWorker) {
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      markAvailable(worker);
    }
  });
}

export function initAppUpdateWatcher(registration: ServiceWorkerRegistration): void {
  // Covers an update that finished installing before this code ran (e.g.
  // a fast install racing the page's own script evaluation).
  if (registration.waiting && navigator.serviceWorker.controller) {
    markAvailable(registration.waiting);
  }
  if (registration.installing) trackInstalling(registration.installing);
  registration.addEventListener('updatefound', () => {
    if (registration.installing) trackInstalling(registration.installing);
  });
}

let reloading = false;

export function installAppUpdate(): void {
  if (!waitingWorker) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}
