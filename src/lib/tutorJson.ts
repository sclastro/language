import type { Correction, TutorResponse } from "./types";

/**
 * 解析模型回覆的 JSON。
 *
 * 為何要這麼小心:模型輸出被 `max_tokens` 截斷時,JSON 會缺尾,`JSON.parse` 會拋錯。
 * 舊版直接把原始文字當成 reply 顯示,結果用戶見到成段 `{"reply": "...", "corrections": [{...`
 * 的原始 JSON,而且糾正全部不見了(fallback 回傳空陣列,畫面反而顯示「寫得很自然」)。
 * 現在改為盡量搶救:抽出 reply、rewrite,以及所有**完整**的糾正物件。
 */

/** 由(可能未完成的)JSON 中抽出某個字串欄位的值。 */
export function extractJsonString(src: string, field: string): string {
  const m = src.match(new RegExp(`"${field}"\\s*:\\s*"`));
  if (!m || m.index === undefined) return "";
  let seg = "";
  for (let i = m.index + m[0].length; i < src.length; i++) {
    const ch = src[i];
    if (ch === "\\") {
      seg += ch + (src[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === '"') break;
    seg += ch;
  }
  // 結尾可能截斷了一半的跳脫序列,parse 不到就切一格再試
  for (let cut = 0; cut < 2; cut++) {
    try {
      return JSON.parse('"' + seg.slice(0, seg.length - cut) + '"') as string;
    } catch {
      /* retry */
    }
  }
  return "";
}

/**
 * 串流途中抽出 reply 目前為止的內容(供前端逐字顯示)。
 * 遇到未閉合的引號即視為「目前到此為止」。
 */
export function extractPartialReply(full: string): string {
  return extractJsonString(full, "reply");
}

/** 由某個陣列欄位中,掃出所有**括號完整**的物件(截斷的最後一個會被丟棄)。 */
function extractCompleteObjects(src: string, field: string): unknown[] {
  const m = src.match(new RegExp(`"${field}"\\s*:\\s*\\[`));
  if (!m || m.index === undefined) return [];
  const out: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  for (let i = m.index + m[0].length; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          out.push(JSON.parse(src.slice(start, i + 1)));
        } catch {
          /* 跳過壞的一個 */
        }
        start = -1;
      }
    } else if (ch === "]" && depth === 0) {
      break; // 陣列正常結束
    }
  }
  return out;
}

function toCorrections(arr: unknown[]): Correction[] {
  return arr
    .map((c) => c as Partial<Correction>)
    .filter(
      (c): c is Correction =>
        !!c && typeof c.original === "string" && typeof c.corrected === "string"
    )
    .map((c) => ({
      original: c.original,
      corrected: c.corrected,
      explanation: typeof c.explanation === "string" ? c.explanation : "",
    }));
}

export function parseTutorResponse(raw: string): TutorResponse {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) text = text.slice(start, end + 1);
  }

  try {
    const obj = JSON.parse(text) as Partial<TutorResponse>;
    return {
      reply: typeof obj.reply === "string" ? obj.reply : "",
      corrections: Array.isArray(obj.corrections) ? toCorrections(obj.corrections) : [],
      rewrite: typeof obj.rewrite === "string" ? obj.rewrite : "",
    };
  } catch {
    // 不是 JSON(模型直接答了散文)→ 整段當成 reply
    if (!/"reply"\s*:/.test(text)) {
      return { reply: raw.trim(), corrections: [], rewrite: "" };
    }
    // 截斷的 JSON → 盡量搶救,絕不可把原始 JSON 倒給用戶看
    return {
      reply: extractJsonString(text, "reply"),
      corrections: toCorrections(extractCompleteObjects(text, "corrections")),
      rewrite: extractJsonString(text, "rewrite"),
      truncated: true,
    };
  }
}
