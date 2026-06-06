const CACHE_NAME = "castles-shell-v5";
const CORE_ASSETS = ["./index.html", "./manifest.json", "./favicon.svg", "./favicon.ico", "./castles-icon.svg"];

function shouldBypassCacheForRequest(request) {
  if (request.method !== "GET") return true;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return true;

  if (url.pathname === "/service-worker.js") return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname === "/ws" || url.pathname.startsWith("/ws/")) return true;
  if (url.searchParams.has("onlineGame") || url.searchParams.has("onlineChallenge")) return true;
  for (const key of url.searchParams.keys()) {
    if (key.toLowerCase().includes("token")) return true;
  }

  return false;
}

function shouldUseNetworkFirstForRequest(request) {
  const url = new URL(request.url);
  return request.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html";
}

function cacheSuccessfulResponse(request, response) {
  if (!response || response.status !== 200) return response;
  const copy = response.clone();
  caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
  return response;
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

  if (shouldUseNetworkFirstForRequest(request)) {
    event.respondWith(
      fetch(request)
        .then(response => cacheSuccessfulResponse(request, response))
        .catch(() => caches.match(request).then(cached => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => cacheSuccessfulResponse(request, response));
    })
  );
});
