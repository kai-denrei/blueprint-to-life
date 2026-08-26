#!/usr/bin/env node
/**
 * Minimal static server for blueprint-to-life.
 *
 * It exists for one reason the usual one-liners can't cover: the cache-busting layer
 * only works if the HTML is *never* cached (so the browser sees new ?v= fingerprints)
 * while fingerprinted assets are cached hard (so the fingerprints are worth having).
 *
 *   HTML                      -> Cache-Control: no-cache, must-revalidate
 *   any URL carrying ?v=...   -> Cache-Control: public, max-age=31536000, immutable
 *   everything else           -> Cache-Control: no-cache
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function cacheHeader(pathname, search) {
  if (pathname.endsWith('.html') || pathname === '/') {
    return 'no-cache, no-store, must-revalidate';
  }
  // The service worker must never be cached: a cached sw.js is a permanently pinned app.
  // Browsers cap SW script caching at 24h regardless, but relying on that is not a plan.
  if (pathname === '/sw.js') return 'no-cache, no-store, must-revalidate';
  if (/[?&]v=/.test(search)) {
    return 'public, max-age=31536000, immutable';
  }
  return 'no-cache';
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';

  // Contain the served tree: normalize, then verify the resolved path is under ROOT.
  // The repo root IS the site root. There was a public/ overlay here; it was removed when
  // those assets were flattened into the root, because an overlay that only this server
  // implements is a difference between dev and any static host — and the host wins.
  const filePath = join(ROOT, normalize(pathname));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) throw Object.assign(new Error('is a directory'), { code: 'ENOENT' });
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(filePath)] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': cacheHeader(pathname, url.search),
    });
    res.end(body);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 ' + pathname);
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('500 ' + err.message);
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`blueprint-to-life  ->  http://${HOST}:${PORT}/`);
  console.log(`  box isolation mode: http://${HOST}:${PORT}/?subject=box`);
});
