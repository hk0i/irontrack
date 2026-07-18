import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Computed fresh on every dev-server start / build, so it always reflects
// the commit actually being run — never baked into a tracked source file.
// Falls back to 'dev' if git isn't available (e.g. a source archive with no
// .git directory), matching the old www/commit.js placeholder's behavior.
function commitHash() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  // GitHub Pages serves this project from /irontrack/, not the domain root —
  // set via DEPLOY_BASE in the Pages workflow only. Docker/nginx and local
  // dev both serve from `/`, so the default here must stay `/` for them.
  base: process.env.DEPLOY_BASE || '/',
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      // Registered by hand in main.js instead — keeps the exact
      // updateViaCache/registration.update() behavior the app already had,
      // rather than the plugin's generic injected register snippet.
      injectRegister: false,
      // manifest.json is a static file in public/, linked by hand in
      // index.html — not plugin-generated. Since that disables the plugin's
      // own manifest-icon precache inclusion, list these explicitly so the
      // manifest and icons are precached too, matching the old ASSET_LIST.
      manifest: false,
      includeAssets: ['manifest.json', 'icons/*.png'],
      // Don't run the service worker during `vite dev` — it would fight
      // Vite's own HMR with stale cached responses. Offline/precache
      // behavior is verified against a real build (`vite build` + `vite
      // preview`), not the dev server.
      devOptions: {
        enabled: false,
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_HASH__: JSON.stringify(commitHash()),
  },
});
