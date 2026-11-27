// Avenor PWA Service Worker — Offline Shell & Performance Caching
const CACHE_NAME = "avenor-pwa-v1";

const PRECACHE_ASSETS = [
  "/",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
];

// Install: precache shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: cleanup stale caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: Network-first for dynamic & RPC requests, Cache-fallback for static assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept Web3 RPC, POST requests, or browser-extensions
  if (
    request.method !== "GET" ||
    url.pathname.startsWith("/v1/") ||
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("rpc") ||
    url.hostname.includes("onfinality") ||
    url.protocol.startsWith("chrome-extension")
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful static asset responses
        if (
          response.status === 200 &&
          (url.pathname.match(/\.(js|css|svg|png|jpg|jpeg|woff2)$/) ||
            PRECACHE_ASSETS.includes(url.pathname))
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        // Fallback to cache if offline
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          return (await caches.match("/")) || Response.error();
        }
        return Response.error();
      })
  );
});
