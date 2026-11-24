/*
 * Soarbase service worker (phone/web build only; the desktop app never registers it).
 *
 * Speed rules:
 * - App page: try the network for the newest version, but never wait more than 1.5 s. On slow
 *   airfield mobile data the saved copy opens instantly; offline it opens immediately.
 * - Code files (assets/*) have content hashes, so a saved copy is always correct: cache-first, and
 *   kept across updates (an update only downloads the files that actually changed).
 * - 3D engine and model files (cesium/*, models/*) never change between versions: cache-first, kept.
 * - Map, satellite and terrain tiles: cache-first for 7 days (then refreshed), up to ~3000 tiles, so
 *   maps and the 3D replay load fast and work offline for areas you've already seen.
 * - Everything else (Supabase, weather) goes straight to the network.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const SHELL = `soarbase-shell-${VERSION}`;
const ASSETS = 'soarbase-assets';
const STATIC = 'soarbase-static';
const TILES = 'soarbase-tiles';
const KEEP = [SHELL, ASSETS, STATIC, TILES];
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './favicon.svg'];
const TILE_HOSTS = ['tile.openstreetmap.org', 'tile.opentopomap.org', 'server.arcgisonline.com', 's3.amazonaws.com'];
const TILE_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const TILE_MAX = 3000;
const ASSET_MAX = 200;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('soarbase-') && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const timeout = (ms) => new Promise((r) => setTimeout(() => r(null), ms));

/** Drop the oldest entries when a cache grows past `max` (keys() returns insertion order). */
let trimming = false;
async function trim(name, max) {
  if (trimming) return;
  trimming = true;
  try {
    const c = await caches.open(name);
    const keys = await c.keys();
    for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
  } finally { trimming = false; }
}
let puts = 0;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Map / satellite / terrain tiles (cross-origin, CORS).
  if (TILE_HOSTS.includes(url.hostname) && (url.hostname !== 's3.amazonaws.com' || url.pathname.startsWith('/elevation-tiles-prod/'))) {
    e.respondWith((async () => {
      const cache = await caches.open(TILES);
      const hit = await cache.match(req);
      const fresh = hit && Date.now() - Number(hit.headers.get('x-sb-cached') || 0) < TILE_MAX_AGE_MS;
      if (fresh) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && (res.type === 'cors' || res.type === 'basic')) {
          const body = await res.clone().arrayBuffer();
          const headers = new Headers(res.headers);
          headers.set('x-sb-cached', String(Date.now()));
          e.waitUntil(cache.put(req, new Response(body, { status: res.status, statusText: res.statusText, headers }))
            .then(() => { if (++puts % 100 === 0) return trim(TILES, TILE_MAX); }));
        }
        return res;
      } catch (err) {
        if (hit) return hit; // offline: an older tile is better than none
        throw err;
      }
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cached = await caches.match('./index.html', { cacheName: SHELL });
      // no-store: GitHub Pages lets browsers reuse index.html for 10 minutes; ask for the newest version.
      const network = fetch(req, { cache: 'no-store' }).then((res) => {
        if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(SHELL).then((c) => c.put('./index.html', copy))); }
        return res;
      });
      if (!cached) return network.catch(() => caches.match('./'));
      const first = await Promise.race([network.catch(() => null), timeout(1500)]);
      return first || cached;
    })());
    return;
  }

  const isStatic = /\/(cesium|models)\//.test(url.pathname);
  if (isStatic || /\/assets\/|\.(png|svg|webmanifest|woff2?)$/.test(url.pathname)) {
    const name = isStatic ? STATIC : ASSETS;
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          e.waitUntil(caches.open(name).then((c) => c.put(req, copy)).then(() => (name === ASSETS ? trim(ASSETS, ASSET_MAX) : undefined)));
        }
        return res;
      })),
    );
  }
});
