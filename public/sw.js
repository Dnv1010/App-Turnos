/* eslint-disable no-restricted-globals */
/**
 * No usar event.data.json(): en Chromium equivale a Response.json() y un push vacío
 * lanza "Failed to execute 'json' on 'Response': Unexpected end of JSON input".
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const defaults = { title: "Turnos BIA", body: "", url: "/tecnico", tag: "turnos-bia" };
  event.waitUntil(
    (async () => {
      let payload = { ...defaults };
      try {
        if (event.data) {
          const text = await event.data.text();
          const trimmed = text.trim();
          if (trimmed) {
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                payload = { ...payload, ...parsed };
              } else {
                payload.body = String(parsed);
              }
            } catch {
              payload.body = text;
            }
          }
        }
      } catch {
        /* sin payload legible */
      }
      await self.registration.showNotification(payload.title || "App Turnos", {
        body: payload.body != null ? String(payload.body) : "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        vibrate: [200, 100, 200],
        tag: payload.tag || "turnos-bia",
        renotify: true,
        data: { url: payload.url || "/tecnico" },
        requireInteraction: true,
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/tecnico";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const path = new URL(url, self.location.origin).pathname;
      for (const client of clientList) {
        if (client.url.includes(path) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
