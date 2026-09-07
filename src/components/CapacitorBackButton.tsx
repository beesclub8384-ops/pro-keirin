"use client";

import { useEffect } from "react";

export default function CapacitorBackButton() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        // canGoBack 은 플러그인이 네이티브 WebView.canGoBack() 을 읽어 넘겨주는 값이다.
        // (@capacitor/app AppPlugin.java — notifyListeners("backButton", {canGoBack}))
        //
        // ⚠️ 예전엔 window.history.length > 1 로 판정했는데 이게 틀렸다 (2026-09-07 진단).
        //    history.length 는 "앞으로 갈 항목까지 포함한 세션 히스토리 총 개수"라
        //    뒤로 가도 줄지 않는다. 홈 A → B → C 이동 후 뒤로 두 번 눌러 A 로 돌아와도
        //    length 는 여전히 3 → history.back() 을 호출하지만 최초 항목이라 아무 일도
        //    일어나지 않는다 → 뒤로가기로 앱을 나갈 수 없는 먹통 상태가 됐다.
        const listener = await App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back();
          } else {
            App.exitApp();
          }
        });
        cleanup = () => listener.remove();
      } catch {
        // not running in Capacitor
      }
    })();

    return () => {
      cleanup?.();
    };
  }, []);

  return null;
}
