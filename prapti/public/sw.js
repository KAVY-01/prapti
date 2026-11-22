// Prapti service worker. The build script replaces the two tokens below.
const CACHE = "prapti-__CACHE_VERSION__";
const PRECACHE = __PRECACHE_LIST__;
// Fingerprinted asset names look like app.abc12345.css
const HASHED_ASSET = /\.[0-9a-f]{8}\.[A-Za-z0-9]+$/;

function store(request, response) {
  if (response && response.ok && response.type === "basic") {
    caches.open(CACHE).then((cache) => cache.put(request, response.clone())).catch(() => {});
  }
  return response;
}

function networkFirstNavigation(request) {
  return fetch(request)
    .then((response) => store(request, response))
    .catch(() =>
      caches.match(request).then((hit) => hit || caches.match("/")).then((hit) => hit || Response.error())
    );
}

function cacheFirst(request) {
  return caches.match(request).then((hit) => {
    if (hit) return hit;
    return fetch(request).then((response) => store(request, response));
  });
}

function networkFirst(request) {
  return fetch(request)
    .then((response) => store(request, response))
    .catch(() => caches.match(request).then((hit) => hit || Response.error()));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith("prapti-") && key !== CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Cross-origin requests (for example Google Fonts) pass straight through.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
  } else if (HASHED_ASSET.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});
