/*
 * Soarbase service worker (phone/web build only; the desktop app never registers it).
 *
 * - App shell: index.html is fetched network-first and kept as the offline fallback, so the
 *   app opens from the home screen without a connection.
 * - Built files (assets/*, cesium/*, icons) have content hashes or never change: cache-first.
 * - Everything cross-origin (map tiles, Supabase, weather) goes straight to the network.
 * The cache name carries the app version (?v=…), so an update replaces the old cache.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const SHELL = `soarbase-shell-${VERSION}`;
const ASSETS = `soarbase-assets-${VERSION}`;
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('soarbase-') && k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      // no-store: GitHub Pages lets browsers reuse index.html for 10 minutes; always ask for the newest version.
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(SHELL).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html', { cacheName: SHELL }).then((r) => r || caches.match('./'))),
    );
    return;
  }

  if (/\/(assets|cesium|models)\/|\.(png|svg|webmanifest|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(ASSETS).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
  }
});
