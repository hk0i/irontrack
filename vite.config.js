import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

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
  plugins: [vue(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_HASH__: JSON.stringify(commitHash()),
  },
});
