self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Nuova notifica SOC";
  const body = payload.message || "È disponibile un nuovo evento.";
  const alertId = payload.alert;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.ico",
      data: {
        alertId,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const alertId = event.notification.data?.alertId;
  const targetPath = alertId ? `/alerts/${alertId}` : "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((client) => "focus" in client);
      if (existing) {
        existing.postMessage({ type: "navigate", path: targetPath });
        return existing.focus();
      }
      return clients.openWindow(targetPath);
    }),
  );
});
