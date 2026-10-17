// Service Worker des Admin-Bereichs, registriert mit Scope "/admin".
//
// Er macht genau zwei Dinge: Push-Benachrichtigungen anzeigen und beim Tippen
// darauf den Admin öffnen. Bewusst KEIN fetch-Handler und kein Caching – die
// Belegung muss immer frisch vom Server kommen, ein veralteter Stand aus dem
// Cache könnte zu Doppelbuchungen führen.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "Ferienwohnung Heuler", body: "", url: "/admin" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // Kein oder kein JSON-Inhalt: mit dem Standardtext anzeigen.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { url: data.url },
      lang: "de",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/admin", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Ist der Admin schon offen, dorthin wechseln und neu laden, damit die
      // neue Anfrage sichtbar ist – statt ein zweites Fenster zu öffnen.
      for (const client of windows) {
        if (new URL(client.url).pathname.startsWith("/admin")) {
          await client.focus();
          return client.navigate(url);
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
