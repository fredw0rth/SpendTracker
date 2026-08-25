// Cache name includes a version number — bump this any time index.html or app.jsx changes,
// so returning users get the update instead of a stale cached copy.
const CACHE_NAME = "spendtracker-v69";
const CACHED_FILES = [
  "./",
  "./index.html",
  "./app.js",
  "./reconcile.js",
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

// The shell's own URLs, resolved once against this worker's scope.
const SHELL_URLS = new Set(CACHED_FILES.map((f) => new URL(f, self.registration.scope).href));

// "Network-first" is not enough on its own: fetch() still consults the BROWSER's HTTP cache, and
// GitHub Pages serves these files with a ten-minute max-age, so a deploy could sit unseen for that
// long even with CACHE_NAME bumped. Re-requesting our own files with cache:"reload" forces a real
// revalidation, so an update shows up on the next load rather than whenever the HTTP cache expires.
//
// Only our own files. The React builds from the CDN are immutable and should stay cached hard.
// Navigations are left alone — index.html barely changes, and rewriting a navigation request risks
// turning a redirect into a response respondWith() will reject.
function freshShellRequest(request) {
  try {
    if (request.mode !== "navigate" && SHELL_URLS.has(new URL(request.url).href)) {
      return new Request(request.url, { cache: "reload" });
    }
  } catch (e) { /* malformed URL, or Request construction refused — use the original */ }
  return request;
}

// Network-first for the app shell files (so you get updates when online), falling back to
// cache when offline. Everything else (the React/Babel CDN scripts) falls back to whatever
// the browser's own HTTP cache already has.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(freshShellRequest(event.request))
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      // Scope the fallback to THIS release's cache. An unscoped caches.match() searches every
      // cache still on the device, so a flaky connection could serve an app.js from one release
      // against an index.html/crypto.js from another — a version mix that crashes in ways the
      // stack trace won't explain.
      .catch(() => caches.open(CACHE_NAME).then((cache) => cache.match(event.request)))
  );
});
