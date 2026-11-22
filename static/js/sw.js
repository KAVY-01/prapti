// Prapti service worker: pages and files you have opened keep working offline
// (a weak signal at a Mee Seva centre or on a bus). Network first, so you always get fresh
// rules when online; the saved copy is only used when the network fails.
var CACHE = "prapti-v3";
var PRECACHE = ["/"];
// Only these pages are kept: nothing from admin, helper print-outs or the API.
var KEEP = /^\/(?:$|about$|tracker$|documents$|results$|changes$|scheme\/[\w-]+$|static\/)/;

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE); }).catch(function () {}));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!KEEP.test(url.pathname)) {
    // Not saved, but a page you open offline still shows the home page instead of a browser error
    if (req.mode === "navigate") {
      e.respondWith(fetch(req).catch(function () { return caches.match("/").then(function (h) { return h || Response.error(); }); }));
    }
    return;
  }
  // Fingerprinted files (?v=...) never change: answer from the saved copy at once.
  if (url.pathname.indexOf("/static/") === 0 && url.searchParams.get("v")) {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      });
    }));
    return;
  }
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === "basic") {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === "navigate") return caches.match("/");
        return Response.error();
      });
    })
  );
});
