/* eslint-disable no-restricted-globals */

const CACHE_NAME = "turnos-bia-v5";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(["/login", "/icon-192.png", "/icon-512.png"]).catch(() => {})
      )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo interceptar requests del mismo origen; dejar pasar APIs sin tocar
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navegación: network-first, fallback a cache o a /login offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/login"))
        )
    );
  }
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data = {};
      try {
        if (event.data) {
          data = await event.data.json();
        }
      } catch {
        data = {};
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        data = {};
      }

      const title = data.title || "Turnos BIA";
      const options = {
        body: data.body || "",
        icon: data.icon || "/icon-192.png",
        badge: "/icon-72.png",
        tag: data.tag || "turnos-bia",
        data: { url: data.url || "/" },
        requireInteraction: false,
      };
      await self.registration.showNotification(title, options);

      // Notifica a la app abierta si el push es para el líder
      if (data.tag === "jornada-alerta-lider") {
        const channel = new BroadcastChannel("jornada-lider-alert");
        channel.postMessage({
          title: data.title,
          body: data.body,
          url: data.url,
        });
        channel.close();
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(self.clients.openWindow(url));
});
