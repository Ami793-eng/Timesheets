/* FiNASh Time service worker
 * Lets the home-screen app open without signal. Network first, so updates
 * always arrive when online; falls back to the last saved copy when offline.
 */
const CACHE = "timesheet-hub";
const CORE = [
  "./", "index.html", "styles.css", "app.js", "lib/exceljs.min.js", "lib/jspdf.umd.min.js", "lib/pdf-lib.min.js", "form-profiles.js", "forms.js", "roster-entry.js", "swaps.js", "leave.js", "template.xlsx",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
  "fonts/dancing-script.woff2", "fonts/great-vibes.woff2", "fonts/caveat.woff2", "fonts/homemade-apple.woff2"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req, { cache: "no-cache" });
      if (fresh.ok) {
        const copy = fresh.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return fresh;
    } catch {
      const cached = await caches.match(req) || await caches.match(req, { ignoreSearch: true });
      return cached || (req.mode === "navigate" ? caches.match("index.html") : Response.error());
    }
  })());
});
