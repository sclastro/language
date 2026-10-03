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
    "`alternatives`: zero to two other natural ways to say the same thing that are genuinely useful,",
    "for example a more polite version or a shorter one. Return an empty array when the main version is enough.",
    "",
    "Output English only. Respond with ONLY a JSON object, no markdown:",
    '{"english": string, "alternatives": [string]}',
  ].join("\n");
}

/** 解析模型回覆;不是 JSON 就把整段當成譯文(總好過甚麼都沒有)。 */
export function parseTranslation(raw: string): Translation {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1)) as Partial<Translation>;
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
      /* 退回下面 */
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
