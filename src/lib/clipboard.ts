/**
 * 把文字複製到剪貼簿;成功回 true。
 *
 * 首選 `navigator.clipboard`(需要 https 及用戶手勢,Vercel 上兩者皆符合)。
 * 舊版 iOS Safari 或 PWA 內偶爾會被拒絕,故退回隱藏 textarea + `execCommand("copy")`。
 */
export async function copyText(text: string): Promise<boolean> {
  const t = text.trim();
  if (!t) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch {
    /* 退回舊方法 */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.setAttribute("readonly", "");
    // 放在畫面外;字體要 ≥16px,否則 iOS 會自動放大頁面
    ta.style.cssText = "position:fixed;top:-1000px;left:0;opacity:0;font-size:16px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, t.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
