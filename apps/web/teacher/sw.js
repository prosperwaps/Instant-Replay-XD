/* Teacher App service worker: keeps the app working with no network.
   App files are cached on install and served from the phone first, so the app opens
   instantly and offline. Marks never go through here: they are stored by the app itself
   and sent by its sync step. Bump VERSION whenever an app file changes. */
const VERSION = 'bchs-teacher-v9';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  '../assets/css/styles.css', '../assets/css/teacher.css',
  '../assets/js/admin-shell.js', '../assets/js/school-data.js', '../assets/js/teacher.js',
  '../assets/vendor/pdf-lib.min.js',
  '../assets/fonts/jetbrains-mono-400.woff2', '../assets/fonts/jetbrains-mono-500.woff2',
  '../assets/fonts/jetbrains-mono-600.woff2', '../assets/fonts/jetbrains-mono-700.woff2'
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bchs-teacher-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* The page asks the new version to take over once the teacher taps "Update". */
self.addEventListener('message', (event) => { if (event.data === 'activate-update') self.skipWaiting(); });

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Space Grotesk from Google Fonts: serve the stored copy, refresh it in the background.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req);
      const fresh = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || fresh;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // App files: phone copy first, network as fallback (and stored for next time).
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((cache) => cache.put(req, copy)); }
    return res;
  }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
