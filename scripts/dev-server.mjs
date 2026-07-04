// Zero-dependency static file server for local testing. Node built-ins only.
// Needed because IndexedDB and native ES module imports require an http://
// origin, not file://. Sends Cache-Control: no-store so the service worker's
// cache-first production strategy never masks changes during development.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(dirname(fileURLToPath(import.meta.url))), 'www');
const port = Number(process.env.PORT) || 8080;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const relativePath = urlPath === '/' ? '/index.html' : urlPath;
    const resolvedPath = normalize(join(rootDir, relativePath));

    // Directory traversal guard: resolved path must stay inside rootDir.
    if (!resolvedPath.startsWith(rootDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const fileStat = await stat(resolvedPath).catch(() => null);
    if (!fileStat || !fileStat.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      console.log(`404 ${req.method} ${urlPath}`);
      return;
    }

    const contents = await readFile(resolvedPath);
    const contentType = mimeTypes[extname(resolvedPath)] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    });
    res.end(contents);
    console.log(`200 ${req.method} ${urlPath}`);
  } catch (err) {
    res.writeHead(500);
    res.end('Internal server error');
    console.error(err);
  }
});

server.listen(port, () => {
  console.log(`[dev-server] serving ${rootDir} at http://localhost:${port}`);
});
