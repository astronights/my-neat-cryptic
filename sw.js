// Service worker: precaches the app shell + puzzle data so the app works offline.
// Bump VERSION whenever any app file changes; the new worker waits until the
// user taps "Reload" on the update toast.
const VERSION = 'v1.0.1';
const SHELL_CACHE = `cq-shell-${VERSION}`;
const DATA_CACHE = `cq-data-${VERSION}`;
const FONT_CACHE = 'cq-fonts-v1';
const KEEP = [SHELL_CACHE, DATA_CACHE, FONT_CACHE];

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/config.js',
  'js/data.js',
  'js/md.js',
  'js/progress.js',
  'js/store.js',
  'js/ui.js',
  'js/views/clue.js',
  'js/views/crosswords.js',
  'js/views/grid.js',
  'js/views/learn.js',
  'js/views/solve.js',
  'js/views/stats.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];
// The data can come from the static file or the Vercel function; both are
// stored under one cache key.
const DATA_URLS = ['data/minute_cryptic.json', 'api/data'];
const DATA_KEY = new URL('__data__.json', self.registration.scope).href;
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,600;1,9..144,800&family=Inter:wght@400;500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap';

const isDataPath = (url) => DATA_URLS.some((p) => url.pathname.endsWith('/' + p));

async function cacheData() {
  const cache = await caches.open(DATA_CACHE);
  for (const u of DATA_URLS) {
    try {
      const res = await fetch(u, { cache: 'no-cache' });
      if (!res.ok) continue;
      await res.clone().json(); // make sure it's real JSON
      await cache.put(DATA_KEY, res);
      return true;
    } catch { /* try next */ }
  }
  return false;
}

async function cacheFonts() {
  try {
    const cache = await caches.open(FONT_CACHE);
    const res = await fetch(FONT_CSS);
    if (!res.ok) return;
    const css = await res.clone().text();
    await cache.put(FONT_CSS, res);
    // Only the latin subsets are needed for this content.
    const urls = [];
    const re = /\/\*\s*(latin(?:-ext)?)\s*\*\/[^}]*?url\((https:[^)]+\.woff2)\)/g;
    let m;
    while ((m = re.exec(css))) urls.push(m[2]);
    await Promise.all(urls.map((u) => cache.match(u).then((hit) => hit || fetch(u, { mode: 'cors' }).then((r) => r.ok && cache.put(u, r)))));
  } catch { /* fonts are optional; system fallbacks are fine */ }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    await Promise.all([cacheData(), cacheFonts()]);
    // First install: take over straight away. Updates wait for the user.
    if (!self.registration.active) self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('cq-') && !KEEP.includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(FONT_CACHE, req));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (isDataPath(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      const hit = await cache.match(DATA_KEY);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && (res.headers.get('content-type') || '').includes('json')) await cache.put(DATA_KEY, res.clone());
      return res;
    })());
    return;
  }
  if (url.pathname.includes('/api/')) return; // other API calls go straight to the network

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      return (await cache.match('index.html')) || (await cache.match('./')) || fetch(req);
    })());
    return;
  }
  event.respondWith(cacheFirst(SHELL_CACHE, req));
});

async function cacheFirst(cacheName, req) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: cacheName === SHELL_CACHE });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
  } catch (e) {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}
