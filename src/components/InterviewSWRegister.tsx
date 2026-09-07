"use client";

import { useEffect } from "react";

/**
 * 인터뷰 전용 서비스 워커 등록.
 * - /interview-sw.js 를 scope '/interview' 로 등록해 인터뷰 경로만 캐싱(메인 사이트 미영향).
 * - SW 스크립트가 루트(/interview-sw.js)에 있어 더 좁은 scope 지정은 별도 헤더 없이 허용됨.
 * - Capacitor(Android WebView)는 라이브 HTTPS /interview 를 로드하므로 보안 컨텍스트 → SW 동작.
 *
 * ⚠️ scope 는 '/interview/'(뒤 슬래시)가 아니라 '/interview' 여야 한다 (2026-09-07 수정).
 *    SW scope 는 경로 문자열 접두사 매칭이라 '/interview/' 로 두면 정작 시작 페이지인
 *    '/interview' 자신이 scope 밖이 되어 통제를 못 받는다. 앱(server.url)이 여는 첫 화면이
 *    바로 그 '/interview' 라서, 오프라인 폴백이 홈에서만 안 걸리는 상태였다.
 *    server.url 에 슬래시를 붙이는 방식은 못 쓴다 — Next 기본 trailingSlash:false 라
 *    '/interview/' 는 308 로 '/interview' 로 되돌아온다.
 *    '/interview' 로 넓혀도 본관 경로('/', '/racers', '/data/...')는 접두사가 달라 무관하다.
 */
export default function InterviewSWRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/interview-sw.js", { scope: "/interview" })
        .then(() => {
          // 예전 '/interview/' scope 등록이 남아 있으면 정리한다.
          // (같은 스크립트가 두 벌 등록된 채로 남는 것을 막는 목적. 실패해도 무해)
          navigator.serviceWorker
            .getRegistrations()
            .then((regs) => {
              for (const reg of regs) {
                if (reg.scope.endsWith("/interview/")) reg.unregister();
              }
            })
            .catch(() => {});
        })
        .catch((err) => {
          console.warn("[interview-sw] 서비스 워커 등록 실패:", err);
        });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
