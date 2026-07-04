import { exportAllData, importAllData } from '../db.js';
import { settings, setPreferredUnit } from '../store.js';

export default {
  props: {
    navParams: { type: Object, default: () => ({}) },
  },
  emits: ['navigate'],
  setup(props, { emit }) {
    const { ref } = Vue;
    const importStatus = ref('');
    const fileInput = ref(null);

    async function doExport() {
      const payload = await exportAllData();
      const json = JSON.stringify(payload, null, 2);
      const filename = `irontrack-backup-${payload.exportedAt.slice(0, 10)}.json`;
      const file = new File([json], filename, { type: 'application/json' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'IronTrack Backup' });
          return;
        } catch (err) {
          // user cancelled or share failed — fall through to download fallback
        }
      }

      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    }

    function triggerImport() {
      fileInput.value.click();
    }

    async function handleFileSelected(event) {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        await importAllData(payload);
        importStatus.value = 'Import successful.';
      } catch (err) {
        importStatus.value = `Import failed: ${err.message}`;
      } finally {
        event.target.value = '';
      }
    }

    return { settings, setPreferredUnit, doExport, triggerImport, handleFileSelected, importStatus, fileInput, emit };
  },
  template: `
    <div class="min-h-screen bg-slate-950 text-slate-100 pb-10">
      <header class="flex items-center gap-3 px-4 py-5 sticky top-0 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <button @click="emit('navigate', 'dashboard')" aria-label="Back" class="w-11 h-11 flex items-center justify-center rounded-full bg-slate-800 active:bg-slate-700">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="text-lg font-bold">Settings</h1>
      </header>

      <main class="px-4 py-4 space-y-6">
        <div>
          <label class="text-sm text-slate-400 mb-2 block">Preferred weight unit</label>
          <div class="flex rounded-xl overflow-hidden border border-slate-800">
            <button
              @click="setPreferredUnit('lbs')"
              class="flex-1 py-3 font-semibold"
              :class="settings.preferredUnit === 'lbs' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-900 text-slate-300'"
            >
              LBs
            </button>
            <button
              @click="setPreferredUnit('kg')"
              class="flex-1 py-3 font-semibold"
              :class="settings.preferredUnit === 'kg' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-900 text-slate-300'"
            >
              KGs
            </button>
          </div>
          <p class="text-xs text-slate-500 mt-2">Only affects how numbers are displayed — your logged history is never rewritten.</p>
        </div>

        <div class="space-y-2">
          <label class="text-sm text-slate-400 block">Cloud portability</label>
          <button @click="doExport" class="w-full py-3 rounded-xl bg-slate-900 border border-slate-800 font-semibold">
            Export Backup File
          </button>
          <button @click="triggerImport" class="w-full py-3 rounded-xl bg-slate-900 border border-slate-800 font-semibold">
            Import Data File
          </button>
          <input ref="fileInput" type="file" accept="application/json" class="hidden" @change="handleFileSelected" />
          <p v-if="importStatus" class="text-sm text-emerald-400">{{ importStatus }}</p>
        </div>
      </main>
    </div>
  `,
};
