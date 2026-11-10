/* East Sound service worker: installable shell, offline fallback, web push. */
/* eslint-disable no-restricted-globals */

const VERSION = "east-sound-v1";
const SHELL = ["/", "/offline", "/manifest.webmanifest", "/api/pwa-icon?size=192", "/api/pwa-icon?size=512"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache live data: dashboards and the feed must always be fresh.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/dashboard")) return;

  // Pages: network first, cached copy or the offline page when the network fails.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/offline") || caches.match("/"))),
    );
    return;
  }

  // Static assets: cache first, then network.
  if (/\.(css|js|png|jpg|jpeg|svg|webp|woff2?|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => undefined);
            return res;
          }),
      ),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "East Sound", body: "New airplay activity", url: "/dashboard" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {
    /* keep the default copy */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/api/pwa-icon?size=192",
      badge: "/api/pwa-icon?size=192",
      data: { url: data.url },
      tag: data.tag || "east-sound",
      renotify: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
