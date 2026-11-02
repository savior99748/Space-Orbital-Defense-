// Offline support for the installable web app.
// Network-first: players always get the newest version when online, and the cached copy when offline.
const CACHE = "orbital-defense-v2";
const ASSETS = [
  "./", "index.html", "manifest.webmanifest",
  "js/config.js", "js/data.js", "js/maps.js", "js/audio.js", "js/platform.js", "js/analytics.js", "privacy.html", "js/draw.js", "js/bodies.js", "js/game.js",
  "assets/icons/icon-192.png", "assets/icons/icon-512.png",
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(cache => cache.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match("index.html")))
  );
});
