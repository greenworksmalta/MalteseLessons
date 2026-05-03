/* MaltiOnTheGo service worker — keeps lessons usable on the bus / plane / no-signal.
 *
 * Strategy:
 *   - "App shell" assets (HTML, JS, CSS, manifest, icons, splash) → cache-first
 *     so the app boots instantly even offline.
 *   - Lesson JSONs and audio MP3s → stale-while-revalidate so previously-played
 *     content is available offline, and we silently refresh in the background.
 *   - Anything outside the app's scope is passed through untouched.
 *
 * Bump CACHE_NAME whenever any cached file's contents change so old caches are
 * dropped on activation.
 */
const CACHE_NAME = "maltiongthego-v7";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./splash.png",
  "./MaltiOnTheGoLogo.png",
  "./lessons/index.json",
  "./audio/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Use addAll on a clone so a single 404 doesn't fail the whole install.
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(new Request(url, { cache: "no-cache" })).catch(() => {})
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Only handle same-origin requests (Google Fonts and other CDNs can cache themselves).
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isLessonOrAudio = /\/(lessons|audio)\//.test(path);
  const isAppShell = APP_SHELL.some((s) => path.endsWith(s.replace(/^\.\//, "/")));

  if (isAppShell) {
    // Cache-first
    event.respondWith(
      caches.match(req).then((cached) => cached || fetchAndCache(req))
    );
    return;
  }

  if (isLessonOrAudio) {
    // Stale-while-revalidate
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Default: try network, fall back to cache
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});

async function fetchAndCache(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
    }
    return res;
  } catch (e) {
    return new Response("Offline", { status: 503 });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || networkPromise;
}
