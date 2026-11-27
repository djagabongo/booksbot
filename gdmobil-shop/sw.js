/* GDMobil service worker – бързо зареждане и работа при слаба връзка */
const VERSION = "gdm-v29";
const SHELL = ["./", "index.html", "assets/styles.css", "assets/app.js", "assets/data.js", "assets/catalog.js", "assets/legal.js", "assets/boot.js", "assets/img/logo-h.webp"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== "gdm-img").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) return;
  if (url.pathname.includes("/assets/img/")) {
    // снимки: първо от кеша
    e.respondWith(caches.open("gdm-img").then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }))));
    return;
  }
  // всичко друго: първо от мрежата, при липса на връзка – от кеша
  e.respondWith(fetch(req).then((res) => { if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone())); return res; })
    .catch(() => caches.match(req).then((hit) => hit || caches.match("index.html"))));
});
