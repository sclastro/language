import type { Convo } from "./convoStore";

/**
 * 把對話輸出成純文字。
 *
 * 刻意只輸出**已經改好的英文**:沒有標題、日期、原本寫錯的版本、糾正解釋,
 * 亦沒有 AI 的回覆。用戶要的是一份可以直接閱讀或再用的乾淨文字。
 * 統一用 \n,下載時才轉成 \r\n(見 `toTextFile`),Windows 記事本才不會擠成一行。
 */

/**
 * 抽出一句「已改好」的英文:
 *  - 有 rewrite(完整正確版本)就用它
 *  - 沒有 rewrite 但原句本來就沒問題(沒有糾正)→ 用原句
 *  - 有糾正卻沒有 rewrite(例如當時輸出被截斷)→ 沒有可信的正確版本,略過,
 *    寧可少一句,都不要把未改好的錯句混進去
 */
export function correctedText(it: Convo["items"][number]): string | null {
  if (it.kind !== "user") return null;
  const rewrite = it.rewrite?.trim();
  if (rewrite) return rewrite;
  const hasIssues = !!it.corrections && it.corrections.length > 0;
  if (hasIssues) return null;
  const content = it.content.trim();
  return content || null;
}

/** 單一對話 → 只有已改好的句子,一句一段。 */
export function convoToText(c: Convo): string {
  return c.items
    .map(correctedText)
    .filter((s): s is string => !!s)
    .join("\n\n");
}

/**
 * 匯出成純文字:**只有已改好的英文**,沒有標題、日期、原句、糾正解釋或 AI 回覆。
 * 用戶要的是可以直接閱讀或再用的乾淨文字。
 */
export function convosToText(convos: Convo[]): string {
  const body = [...convos]
    .sort((a, b) => a.updatedAt - b.updatedAt) // 由舊到新,順住學習次序讀
    .map(convoToText)
    .filter((t) => t.length > 0)
    .join("\n\n");
  return body.length > 0 ? body + "\n" : "";
}

/**
 * 轉成在 Windows 上也開得正常的 .txt 內容:
 *  - CRLF 換行,否則舊版記事本會把全篇擠成一行
 *  - 加 UTF-8 BOM,否則部分編輯器會猜成 ANSI,令中文解釋變成亂碼
 */
export function toTextFile(text: string): string {
  return "﻿" + text.replace(/\r?\n/g, "\r\n");
}
