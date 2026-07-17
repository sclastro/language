"use client";

import { useEffect } from "react";
import { requestPersistentStorage } from "@/lib/savedStore";

/** 喺 client 端做初始化:註冊 service worker + 申請持久儲存。 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 申請「持久儲存」,減低收藏被瀏覽器自動清走嘅機會。
    requestPersistentStorage();

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
