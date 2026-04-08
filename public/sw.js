/* eslint-disable no-restricted-globals */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
