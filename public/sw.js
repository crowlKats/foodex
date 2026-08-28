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

  // Web Share Target POSTs files as multipart; the page cannot read that
  // body, so stash it (IndexedDB names match lib/share-target.ts) and
  // redirect to a GET of New Recipe.
  if (
    event.request.method === "POST" &&
    url.origin === self.location.origin &&
    url.pathname === "/recipes/new"
  ) {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

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

// IndexedDB names must match lib/share-target.ts.
const SHARE_TARGET_DB = "foodex-share-target";
const SHARE_TARGET_STORE = "incoming";
const SHARE_TARGET_KEY = "latest";
const SHARE_TARGET_FILES_FIELD = "images";
const MAX_QUERY_VALUE = 2000;

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const title = formString(formData.get("title"));
    const text = formString(formData.get("text"));
    const shareUrl = formString(formData.get("url"));
    const files = [];
    for (const value of formData.getAll(SHARE_TARGET_FILES_FIELD)) {
      if (!(value instanceof File) || value.size === 0) continue;
      if (value.type && !value.type.startsWith("image/")) continue;
      files.push({
        name: value.name || "image.jpg",
        type: value.type || "image/jpeg",
        buffer: await value.arrayBuffer(),
      });
    }
    await putShare({
      title,
      text,
      url: shareUrl,
      files,
      createdAt: Date.now(),
    });
    return Response.redirect(
      `${self.location.origin}${
        shareLandingPath({
          title,
          text,
          url: shareUrl,
        })
      }`,
      303,
    );
  } catch (err) {
    console.error("share target failed:", err);
    return Response.redirect(`${self.location.origin}/recipes/new`, 303);
  }
}

function formString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function capQuery(value) {
  return value.length > MAX_QUERY_VALUE
    ? value.slice(0, MAX_QUERY_VALUE)
    : value;
}

function shareLandingPath({ title, text, url }) {
  const params = new URLSearchParams();
  if (url) params.set("url", capQuery(url));
  if (text) params.set("text", capQuery(text));
  if (title && !url && !text) params.set("title", capQuery(title));
  const qs = params.toString();
  return qs ? `/recipes/new?${qs}` : "/recipes/new";
}

function putShare(record) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(SHARE_TARGET_DB, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(SHARE_TARGET_STORE)) {
        db.createObjectStore(SHARE_TARGET_STORE);
      }
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(SHARE_TARGET_STORE, "readwrite");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
      tx.objectStore(SHARE_TARGET_STORE).put(record, SHARE_TARGET_KEY);
    };
  });
}
