const CACHE_NAME = "foodex-v1";

const STATIC_ASSETS = [
  "/favicon.ico",
  "/icon.svg",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/logo.svg",
  "/manifest.json",
];

// Enable navigation preload to fetch HTML in parallel with SW startup
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      // Clean old caches
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k)),
        )
      ),
      // Enable navigation preload
      self.registration.navigationPreload?.enable(),
    ]),
  );
  self.clients.claim();
});

// Pre-cache static assets on install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Navigation requests: use preload response, fall back to network
  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        // Use navigation preload response if available (avoids SW boot-up delay)
        const preloadResponse = await event.preloadResponse;
        if (preloadResponse) return preloadResponse;
        return fetch(event.request);
      })(),
    );
    return;
  }

  // Vite-hashed assets (/_fresh/...): cache-first, immutable
  if (url.pathname.startsWith("/_fresh/")) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) =>
                cache.put(event.request, clone)
              );
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Known static assets: cache-first
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) => cached || fetch(event.request),
      ),
    );
    return;
  }

  // Everything else (API calls, etc.): network-only
});

// Push notifications
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || "Foodex";
  const options = {
    body: data.body || "",
    icon: "/icon-512.png",
    badge: "/icon-512.png",
    data: { url: data.url || "/household/pantry" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/household/pantry";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
