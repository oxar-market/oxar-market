// Приёмник пушей. Глухой ко всему остальному намеренно: ни перехвата
// запросов, ни кэша - такие воркеры однажды начинают отдавать сайту
// вчерашние файлы, и охотиться за этим дороже, чем не уметь. Этот умеет
// ровно две вещи: показать пришедшее и открыть сайт по нажатию.

self.addEventListener("push", (event) => {
  const told = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(told.title ?? "OXAR", {
      body: told.body ?? "",
      icon: "/opengraph-image.png",
      data: { url: told.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((open) => {
      const ours = open.find((one) => one.url.startsWith(self.origin));
      return ours ? ours.focus() : clients.openWindow(url);
    }),
  );
});
