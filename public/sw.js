/* eslint-disable no-restricted-globals */
self.addEventListener("push", (event) => {
  let payload = { title: "Turnos BIA", body: "", url: "/tecnico", tag: "turnos-bia" };
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch {
    /* texto plano */
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.tag || "turnos-bia",
      data: { url: payload.url || "/tecnico" },
      requireInteraction: true,
    })
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
