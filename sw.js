/* ERP Rafael — app instalável: guarda a casca do sistema para abrir sem internet.
   Arquivos do próprio site: rede primeiro (pega versão nova), cópia local se estiver offline.
   Chart.js (cdnjs): cópia local primeiro. Login e OneDrive (Microsoft) nunca passam pelo cache. */
const VER = "erp-rafael-v0.4.4";
const SHELL = ["./", "index.html", "manifest.json", "assets/app.css", "assets/msal-browser.min.js", "assets/icon-192.png", "assets/icon-512.png", "assets/apple-touch-icon.png",
  "js/core.js", "js/icons.js", "js/mod-inicio.js", "js/mod-reminders.js", "js/fin-modelo.js", "js/mod-financas.js", "js/fin-painel.js", "js/mod-investimentos.js", "js/mod-patrimonio.js", "js/mod-sistema.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.origin === location.origin) {
    e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(VER).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  } else if (u.hostname === "cdnjs.cloudflare.com" || u.hostname === "fonts.gstatic.com" || u.hostname === "fonts.googleapis.com") {
    e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then((r) => { const cp = r.clone(); caches.open(VER).then((c) => c.put(e.request, cp)); return r; })));
  }
});
