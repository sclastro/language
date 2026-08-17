/**
 * 把收藏匯出成純文字。
 *
 * 由用戶自己在清單上打勾決定匯出哪幾項 —— 同 ▶ Play selected、⬇ Download MP3
 * 一樣以選取為準,不再由程式猜「哪些算已改好」。之前試過自動由對話抽句子,
 * 結果把未改好的錯句都帶了出來;交回用戶手上最直接可靠。
 *
 * 輸出只有句子本身,一項一段,沒有標題、日期、類別或解釋。
 * 統一用 \n,下載時才轉成 \r\n(見 `toTextFile`),Windows 記事本才不會擠成一行。
 */

export type ExportableItem = { text: string };

/** 選取的項目 → 純文字,一項一段;次序同畫面一致。 */
export function itemsToText(items: ExportableItem[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const it of items) {
    const t = (it?.text ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue; // 同一句收藏過兩次就唔重複輸出
    seen.add(key);
    lines.push(t);
  }
  return lines.length > 0 ? lines.join("\n\n") + "\n" : "";
}

/**
 * 轉成在 Windows 上也開得正常的 .txt 內容:
 *  - CRLF 換行,否則舊版記事本會把全篇擠成一行
 *  - 加 UTF-8 BOM,否則部分編輯器會猜成 ANSI,令中文變成亂碼
 */
export function toTextFile(text: string): string {
  return "﻿" + text.replace(/\r?\n/g, "\r\n");
}
