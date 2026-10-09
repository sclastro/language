/**
 * 中文 → 簡單口語英文。
 *
 * 用途與對話練習不同:不是糾正用戶的英文,而是把用戶打的中文(廣東話口語或書面語,
 * 可以夾雜英文)變成**即時可以開口講**的英文 —— 短句、常用字、口語但不浮誇。
 * 刻意寫成純函數(不碰 localStorage / fetch),方便測試。
 */

export type Translation = {
  /** 主譯文:簡單、口語、可即時使用。 */
  english: string;
  /** 零至兩個其他講法(例如更客氣或更簡短);沒有就是空陣列。 */
  alternatives: string[];
};

/** 歷史紀錄中的一項。 */
export type TranslationEntry = Translation & {
  id: string;
  /** 用戶輸入的中文原文。 */
  chinese: string;
  at: number;
};

/** 歷史最多保留多少項(只存本機,不同步)。 */
export const MAX_HISTORY = 50;

/** 輸入長度上限(字元)。日常溝通用,過長的內容不是這個功能的目的。 */
export const MAX_INPUT_CHARS = 1000;

export function buildTranslatePrompt(): string {
  return [
    "You turn Chinese into simple spoken English that the user can say or send right away.",
    "The input is typed Chinese: Hong Kong Cantonese colloquial writing (e.g. 唔、咗、嘅、喺、冇、啲) or standard written Chinese,",
    "possibly mixed with English words. Understand the Cantonese correctly before translating.",
    "",
    "Style of `english`:",
    "- Everyday spoken English, the way a friendly native speaker would actually say it.",
    "- Short, clear sentences and common words (around B1 level). Split long Chinese sentences into shorter English ones.",
    "- Natural but not exaggerated: no heavy slang, no idioms a learner would struggle with, no textbook formality.",
    "- Keep the full meaning and the tone (polite stays polite, casual stays casual). Do not add or drop information.",
    "- Translate everything the user wrote, keeping the order. Do not answer questions in the text — just translate them.",
    "- If the input is already English, rewrite it as simple, natural spoken English.",
    "",
    "Long input: the text may have several paragraphs, a greeting, or a numbered list.",
    "`english` must ALWAYS contain the translation of the WHOLE text — every paragraph and every list item.",
    "Keep the layout: a blank line (\\n\\n) between paragraphs and each list item on its own line (\\n).",
    "Never split the translation across fields: nothing from the text may appear only in `alternatives`.",
    "",
    "`alternatives`: zero to two other natural ways to say the WHOLE text that are genuinely useful,",
    "for example a more polite version or a shorter one. Each one is a complete version, never a part.",
    "Return an empty array when the main version is enough, and ALWAYS an empty array when the input",
    "is longer than about three sentences or has more than one paragraph.",
    "",
    "Output English only. Respond with exactly ONE JSON object and nothing before or after it, no markdown.",
    "Write the complete translation the first time; never output a second, corrected object.",
    "Use exactly this shape:",
    '{"english": string, "alternatives": [string]}',
  ].join("\n");
}

/**
 * 找出文字中所有括號完整的頂層 JSON 物件(會略過字串內的括號)。
 *
 * ⚠️ 模型有時先輸出一個只譯了第一段的物件,接着寫「Wait, let me give the full translation.」
 * 再輸出完整的第二個物件。舊做法取「第一個 { 至最後一個 }」,兩個物件連在一起 parse 失敗,
 * 結果退回抽第一個 `english` —— 長訊息只得第一段。所以要逐個物件拆開。
 */
function topLevelObjects(src: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = depth > 0;
    else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0) out.push(src.slice(start, i + 1));
    }
  }
  return out;
}

/** 解析模型回覆;不是 JSON 就把整段當成譯文(總好過甚麼都沒有)。 */
export function parseTranslation(raw: string): Translation {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // 有多個物件時取最後一個有效的:那是模型自我更正後的完整版本
  const candidates = topLevelObjects(text).reverse();
  for (const cand of candidates) {
    try {
      const obj = JSON.parse(cand) as Partial<Translation>;
      const english = typeof obj.english === "string" ? obj.english.trim() : "";
      if (english) {
        const seen = new Set([english.toLowerCase()]);
        const alternatives = (Array.isArray(obj.alternatives) ? obj.alternatives : [])
          .filter((a): a is string => typeof a === "string")
          .map((a) => a.trim())
          .filter((a) => {
            const k = a.toLowerCase();
            if (!a || seen.has(k)) return false; // 與主譯文或彼此重複就略去
            seen.add(k);
            return true;
          })
          .slice(0, 2);
        return { english, alternatives };
      }
    } catch {
      /* 試下一個 */
    }
  }
  // 截斷或格式不對:不可把原始 JSON 顯示給用戶
  if (/"english"\s*:/.test(text)) {
    const m = text.match(/"english"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) {
      try {
        return { english: JSON.parse(`"${m[1]}"`) as string, alternatives: [] };
      } catch {
        /* ignore */
      }
    }
    return { english: "", alternatives: [] };
  }
  return { english: raw.trim(), alternatives: [] };
}

/** 加入歷史:最新在前,同一句中文只留最新一次,超出上限就丟最舊的。 */
export function addToHistory(
  list: TranslationEntry[],
  entry: TranslationEntry,
  max = MAX_HISTORY
): TranslationEntry[] {
  const key = entry.chinese.trim();
  return [entry, ...list.filter((e) => e.chinese.trim() !== key)].slice(0, max);
}

/** 由 localStorage 讀出的資料可能損壞或來自舊版,逐項驗證。 */
export function sanitizeHistory(raw: unknown): TranslationEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is TranslationEntry =>
        !!e &&
        typeof e.id === "string" &&
        typeof e.chinese === "string" &&
        typeof e.english === "string" &&
        typeof e.at === "number"
    )
    .map((e) => ({
      ...e,
      alternatives: Array.isArray(e.alternatives)
        ? e.alternatives.filter((a: unknown): a is string => typeof a === "string")
        : [],
    }))
    .slice(0, MAX_HISTORY);
}
