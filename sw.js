/**
 * Service worker.
 *
 * Hand-rolled rather than Workbox: this project has no bundler (see README), so there is
 * nothing to run `injectManifest` in, and the precache list is ~20 known static files that
 * change only when the cache-bust token changes. Workbox would be the larger dependency.
 *
 * The cache name is keyed off that same token. There is exactly one version number in this
 * project and this is it — no second scheme to drift out of sync. `scripts/bust.sh` rewrites
 * the constant below on every bump, and `npm test` fails if it ever stops matching index.html.
 *
 * Update policy: NO unconditional skipWaiting(). A new worker sits in `waiting` and the page
 * shows a toast; skipWaiting only runs when the user says so. Reloading a WebGL app out from
 * under someone mid-orbit is exactly the thing that makes PWAs feel broken.
 */
const CB_TOKEN = 'f48f4e75';
const CACHE = `blueprint-to-life-${CB_TOKEN}`;
const OFFLINE_URL = '/offline.html';

/**
 * The app shell. Every entry is required for a cold offline boot: three and its three addons
 * are the whole runtime, and the geometry is generated at load, so there is no content to
 * fetch afterwards. Roughly 1.4 MB — under the 1–2 MB precache ceiling, and the payoff is
 * that the app is fully functional offline rather than partially.
 */
const PRECACHE = [
  '/',
  '/index.html',
  OFFLINE_URL,
  `/styles.css?v=${CB_TOKEN}`,
  `/src/main.js?v=${CB_TOKEN}`,
  '/src/tank/buildTank.js',
  '/src/tank/dimensions.js',
  '/src/tank/geometry.js',
  '/src/tank/materials.js',
  '/src/tank/parts.js',
  '/src/render/blueprint.js',
  '/src/render/pbr.js',
  '/src/camera/viewController.js',
  '/src/chrome/schematic.js',
  '/src/subjects/tank.js',
  '/src/subjects/box.js',
  '/vendor/three/three.module.js',
  '/vendor/three/three.core.js',
  '/vendor/three/addons/controls/OrbitControls.js',
  '/vendor/three/addons/renderers/CSS2DRenderer.js',
  '/vendor/three/addons/exporters/GLTFExporter.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  `/cb-badge.js?v=${CB_TOKEN}`,
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll is all-or-nothing: one 404 and the whole install fails, leaving the user with no
    // worker at all. Added individually so a single missing asset degrades instead of aborting.
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
        console.warn('[sw] precache miss', url, err);
      }
    }));
  })());
  // Deliberately no skipWaiting() here — see the header comment.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (self.registration.navigationPreload) {
      // Lets the navigation request start in parallel with worker boot rather than after it.
      await self.registration.navigationPreload.enable();
    }
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_TOKEN') event.source?.postMessage({ type: 'TOKEN', token: CB_TOKEN });
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // never cache cross-origin opaques

  // Navigations: network-first with a short timeout, then cache, then the offline page.
  // The HTML carries the fingerprints, so a stale copy of it pins every other asset.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) { void cachePut(request, preload.clone()); return preload; }
        const fresh = await withTimeout(fetch(request), 3000);
        void cachePut(request, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(request))
          || (await caches.match('/index.html'))
          || (await caches.match(OFFLINE_URL))
          || Response.error();
      }
    })());
    return;
  }

  // Fingerprinted assets are immutable by construction: a changed file means a changed URL,
  // so cache-first is safe and there is nothing to revalidate.
  if (url.searchParams.has('v')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else — the ES module graph and the vendored three build, which are NOT
  // fingerprinted (see README) — is stale-while-revalidate: instant from cache, refreshed
  // in the background so the next load has the new copy.
  event.respondWith(staleWhileRevalidate(request));
});

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  void cachePut(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const hit = await caches.match(request);
  const network = fetch(request)
    .then((res) => { void cachePut(request, res.clone()); return res; })
    .catch(() => hit || Response.error());
  return hit || network;
}

async function cachePut(request, response) {
  if (!response || !(response.status === 200 || response.status === 0)) return;
  const cache = await caches.open(CACHE);
  try { await cache.put(request, response); } catch { /* quota or opaque; not fatal */ }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}
