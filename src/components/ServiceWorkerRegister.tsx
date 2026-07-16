"use client";

import { useEffect } from "react";

/** 喺 client 端註冊 service worker,令個 app 可以「安裝」做 PWA。 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // 只喺 production 註冊,避免開發時 cache 阻手。
    if (process.env.NODE_ENV !== "production") return;

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* 註冊唔到就算,唔影響正常使用 */
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
