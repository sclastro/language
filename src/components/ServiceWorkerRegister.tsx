"use client";

import { useEffect } from "react";
import { requestPersistentStorage } from "@/lib/savedStore";

/** 在 client 端初始化:註冊 service worker + 申請持久儲存。 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 申請「持久儲存」,降低收藏被瀏覽器自動清除的機會。
    requestPersistentStorage();

    if (!("serviceWorker" in navigator)) return;
    // 只在 production 註冊,避免開發時 cache 造成干擾。
    if (process.env.NODE_ENV !== "production") return;

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* 註冊失敗亦無妨,不影響正常使用 */
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
