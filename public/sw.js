// 極簡 service worker,俾 app 可以「安裝」做 PWA + 加快重複載入。
// 重點:唔會 cache /api/*(對話係動態,實時打去 Poe),唔會整亂個 app。
const CACHE = "english-tutor-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 唔掂第三方
  if (url.pathname.startsWith("/api/")) return; // 對話 API:一定要即時,唔 cache

  // Next.js hash 過嘅靜態資源:cache-first(內容唔會變)。
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    /\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname);

  if (isStatic) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  // 其他(包括頁面導覽):network-first,冇網先返 cache,起碼見到個殼。
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(request);
        // 唔 cache 轉向(例如未登入被導去 /login),避免污染「/」。
        if (res.ok && !res.redirected) {
          const cache = await caches.open(CACHE);
          cache.put(request, res.clone());
        }
        return res;
      } catch {
        const cached = await caches.match(request);
        return cached || Response.error();
      }
    })()
  );
});
