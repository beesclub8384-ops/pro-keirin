/* 7RANDOMS 인터뷰 서비스 워커 — /interview 스코프 전용 캐싱
 * scope: '/interview/' 로 등록되어 인터뷰 경로만 제어한다(메인 사이트 미영향).
 * Workbox(CDN)로 5개 런타임 캐싱 전략을 구성.
 */
/* eslint-disable */
importScripts(
  "https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js",
);

if (self.workbox) {
  const { core, routing, strategies, expiration, cacheableResponse } =
    self.workbox;

  core.setCacheNameDetails({ prefix: "7r-interview" });
  // 새 SW를 즉시 활성화 + 현재 클라이언트 제어 (배포 후 빠른 반영)
  self.skipWaiting();
  core.clientsClaim();

  const ok = () =>
    new cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] });

  // 1) HTML 페이지(내비게이션) — NetworkFirst (네트워크 우선, 실패 시 캐시)
  routing.registerRoute(
    ({ request }) => request.mode === "navigate",
    new strategies.NetworkFirst({
      cacheName: "7r-interview-html",
      networkTimeoutSeconds: 5,
      plugins: [ok()],
    }),
  );

  // 2) JS / CSS / 워커 자산 — CacheFirst (캐시 우선, 없으면 네트워크)
  routing.registerRoute(
    ({ request }) =>
      request.destination === "script" ||
      request.destination === "style" ||
      request.destination === "worker",
    new strategies.CacheFirst({
      cacheName: "7r-interview-static",
      plugins: [ok()],
    }),
  );

  // 3) 이미지 — CacheFirst + 30일 만료
  routing.registerRoute(
    ({ request }) => request.destination === "image",
    new strategies.CacheFirst({
      cacheName: "7r-interview-images",
      plugins: [
        ok(),
        new expiration.ExpirationPlugin({
          maxEntries: 300,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30일
          purgeOnQuotaError: true,
        }),
      ],
    }),
  );

  // 4) 인터뷰 API (/api/interview/*) — StaleWhileRevalidate (GET만)
  routing.registerRoute(
    ({ url, request }) =>
      request.method === "GET" && url.pathname.startsWith("/api/interview/"),
    new strategies.StaleWhileRevalidate({
      cacheName: "7r-interview-api",
      plugins: [ok()],
    }),
  );

  // 5) Supabase 직접 호출 — StaleWhileRevalidate (GET만)
  routing.registerRoute(
    ({ url, request }) =>
      request.method === "GET" && url.hostname.endsWith(".supabase.co"),
    new strategies.StaleWhileRevalidate({
      cacheName: "7r-interview-supabase",
      plugins: [ok()],
    }),
  );
} else {
  // Workbox 로드 실패(오프라인 최초설치 등) → 아무 것도 가로채지 않고 통과
  self.addEventListener("fetch", () => {});
}
