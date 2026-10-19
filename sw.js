const CACHE_PREFIX = "simple-tip-calculator-";
const CACHE_NAME = `${CACHE_PREFIX}v2`;
// Cache only this explicit list of public files, never calculator values,
// payment pages, or other external requests.
const APP_FILES = [
  "./", "./index.html", "./privacy.html", "./terms.html", "./styles.css",
  "./calculator.js", "./app.js", "./share.js", "./footer.js", "./pwa.js", "./analytics.js",
  "./icon.svg", "./manifest.webmanifest", "./icons/icon-192.png",
  "./icons/icon-512.png", "./icons/apple-touch-icon.png"
];
const APP_URLS = new Set(APP_FILES.map(path => new URL(path, self.location.href).href));

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_FILES);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkOrOfflineCopy(request, key) {
  try {
    // Always try the network. A slow but working connection must not switch
    // to the offline copy merely because a fixed timeout has elapsed.
    const response = await fetch(request, { cache: "no-cache" });
    if (response.ok && response.type === "basic") {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(key, response.clone());
      } catch {
        // Full or unavailable storage must not break an online visit.
      }
    }
    return response;
  } catch {
    const cached = await caches.match(key, { cacheName: CACHE_NAME });
    return cached || Response.error();
  }
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  url.search = "";
  url.hash = "";
  if (APP_URLS.has(url.href)) {
    // Prefer fresh files online, falling back to saved files offline.
    event.respondWith(networkOrOfflineCopy(event.request, url.href));
  }
});
