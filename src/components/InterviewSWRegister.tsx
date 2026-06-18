"use client";

import { useEffect } from "react";

/**
 * 인터뷰 전용 서비스 워커 등록.
 * - /interview-sw.js 를 scope '/interview/' 로 등록해 인터뷰 경로만 캐싱(메인 사이트 미영향).
 * - SW 스크립트가 루트(/interview-sw.js)에 있어 더 좁은 scope 지정은 별도 헤더 없이 허용됨.
 * - Capacitor(Android WebView)는 라이브 HTTPS /interview 를 로드하므로 보안 컨텍스트 → SW 동작.
 */
export default function InterviewSWRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/interview-sw.js", { scope: "/interview/" })
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
