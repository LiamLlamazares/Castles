const CACHE_NAME = "castles-shell-v3";
const CORE_ASSETS = ["./", "./index.html", "./manifest.json", "./favicon.ico", "./castles-icon.svg"];

function shouldBypassCacheForRequest(request) {
  if (request.method !== "GET") return true;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return true;

  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname === "/ws" || url.pathname.startsWith("/ws/")) return true;
  if (url.searchParams.has("onlineGame") || url.searchParams.has("token")) return true;

  return false;
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (shouldBypassCacheForRequest(request)) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        if (!response || response.status !== 200) return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      });
    })
  );
});
