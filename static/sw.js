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
