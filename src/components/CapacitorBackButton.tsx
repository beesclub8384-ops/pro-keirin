"use client";

import { useEffect } from "react";

export default function CapacitorBackButton() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const listener = await App.addListener("backButton", () => {
          if (window.history.length > 1) {
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
