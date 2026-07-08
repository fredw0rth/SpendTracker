// Cache name includes a version number — bump this any time index.html or app.jsx changes,
// so returning users get the update instead of a stale cached copy.
const CACHE_NAME = "spendtracker-v10";
const CACHED_FILES = [
  "./",
  "./index.html",
  "./app.js",
  "./crypto.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

// On install, pre-cache the app shell so it's available offline from the first load onward.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHED_FILES))
  );
  self.skipWaiting();
});

// On activate, clear out any caches from a previous version of the service worker.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Network-first for the app shell files (so you get updates when online), falling back to
// cache when offline. Everything else (the React/Babel CDN scripts) falls back to whatever
// the browser's own HTTP cache already has.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
