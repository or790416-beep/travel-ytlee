const CACHE_NAME = "travel-app-v6-ui-14-sync-1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/favicon-32.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cacheResponse(request, response) {
  if (!response?.ok || response.type === "opaque") return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirstNavigation(request) {
  try {
    return await cacheResponse(request, await fetch(request));
  } catch {
    return (await caches.match(request, { ignoreSearch: true })) || (await caches.match("./index.html")) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((response) => cacheResponse(request, response))
    .catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});
