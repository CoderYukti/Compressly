/* Compressly service worker: lets the tool open offline after the first visit.
   App files + CDN libraries are cached; updates are picked up on the next load. */
const CACHE = 'compressly-v4';
const SHELL = ['./', 'index.html', 'style.css', 'script.js', 'engine.js', 'compress.worker.js',
               'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const LIBS = [
  'https://cdn.jsdelivr.net/npm/pako@1.0.11/dist/pako.min.js',
  'https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap',
];
const HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map(u => c.add(u)));
    await Promise.allSettled(LIBS.map(u => fetch(u, { mode: 'no-cors' }).then(r => c.put(u, r))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// stale-while-revalidate for our own files and the CDN hosts above
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin && !HOSTS.includes(url.hostname)) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});
