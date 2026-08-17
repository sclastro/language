import { SCENARIOS } from "./scenarios";
import type { Convo } from "./convoStore";

/**
 * 把對話輸出成純文字,方便閱讀、列印或貼到其他地方。
 *
 * 備份用的 JSON 是給程式讀的,人看不懂;這裡的重點是**可讀性**:
 * 每輪連同糾正與完整正確版本一併列出,那才是真正值得溫習的內容。
 * 統一用 \n,下載時才轉成 \r\n(見 `toTextFile`),Windows 記事本才不會擠成一行。
 */

function scenarioLabel(id: string): string {
  return SCENARIOS.find((s) => s.id === id)?.label ?? id;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 單一對話轉純文字。 */
export function convoToText(c: Convo): string {
  const out: string[] = [];
  const bar = "=".repeat(60);
  out.push(bar);
  out.push(c.title);
  out.push(`${scenarioLabel(c.scenario)} · ${fmtDate(c.updatedAt)}`);
  out.push(bar);
  out.push("");

  for (const it of c.items) {
    if (it.kind === "user") {
      out.push("[You]");
      out.push(it.content);

      if (it.corrections && it.corrections.length > 0) {
        out.push("");
        out.push("  Corrections:");
        for (const k of it.corrections) {
          out.push(`  - "${k.original}" -> "${k.corrected}"`);
          if (k.explanation) out.push(`    ${k.explanation}`);
        }
      }
      // rewrite 與原句相同就不必重複列出
      if (it.rewrite && it.rewrite.trim() !== it.content.trim()) {
        out.push("");
        out.push("  Full corrected version:");
        out.push(`  ${it.rewrite}`);
      }
    } else {
      out.push("[AI]");
      out.push(it.content);
    }
    out.push("");
  }
  return out.join("\n").trimEnd() + "\n";
}

/** 多個對話合成一個檔案(最近更新排最前)。 */
export function convosToText(convos: Convo[]): string {
  if (convos.length === 0) {
    return "No conversations to export.\n";
  }
  const header = [
    "English Tutor — conversation transcript",
    `Exported ${fmtDate(Date.now())}`,
    `${convos.length} conversation${convos.length === 1 ? "" : "s"}`,
    "",
    "",
  ].join("\n");
  const body = [...convos]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(convoToText)
    .join("\n\n");
  return header + body;
}

/**
 * 轉成在 Windows 上也開得正常的 .txt 內容:
 *  - CRLF 換行,否則舊版記事本會把全篇擠成一行
 *  - 加 UTF-8 BOM,否則部分編輯器會猜成 ANSI,令中文解釋變成亂碼
 */
export function toTextFile(text: string): string {
  return "﻿" + text.replace(/\r?\n/g, "\r\n");
}
