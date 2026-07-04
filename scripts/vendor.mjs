// Copies the runtime libraries' browser-ready dist files out of node_modules
// and into www/vendor/. This is a local file copy, not a network fetch — the
// only network access anywhere in this workflow is the one-time `npm install`.
// index.html loads these as plain <script> tags (all three are UMD/global
// builds, not ES modules), so the app itself never touches a bundler.
import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const vendorDir = join(rootDir, 'www', 'vendor');

const files = [
  {
    src: join(rootDir, 'node_modules', 'vue', 'dist', 'vue.global.prod.js'),
    dest: join(vendorDir, 'vue.global.prod.js'),
  },
  {
    src: join(rootDir, 'node_modules', 'dexie', 'dist', 'dexie.min.js'),
    dest: join(vendorDir, 'dexie.min.js'),
  },
  {
    src: join(rootDir, 'node_modules', '@tailwindcss', 'browser', 'dist', 'index.global.js'),
    dest: join(vendorDir, 'tailwind-browser.js'),
  },
];

mkdirSync(vendorDir, { recursive: true });

let allOk = true;
for (const { src, dest } of files) {
  if (!existsSync(src)) {
    console.error(`[vendor] MISSING: ${src}`);
    console.error(`[vendor] Run "npm install" first so this package is available in node_modules.`);
    allOk = false;
    continue;
  }
  copyFileSync(src, dest);
  const { size } = statSync(dest);
  console.log(`[vendor] ${dest.replace(rootDir + '/', '')}  (${(size / 1024).toFixed(1)} KB)`);
}

if (!allOk) {
  process.exit(1);
}

console.log('[vendor] done.');
