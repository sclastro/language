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

/**
 * 輸入長度上限(字元)。
 *
 * ⚠️ 曾經是 1000,而輸入框又設了同值的 `maxLength` —— 貼上長文時瀏覽器會把超出部分
 * **靜靜刪去**,用戶只見到譯文「中間被 cut 咗」。現在放寬至 3000(一封長電郵或一份通告),
 * 輸入框不再設 `maxLength`,超出時改為顯示字數並停用「Translate」。
 */
export const MAX_INPUT_CHARS = 3000;

/**
 * 超過這個長度就分段翻譯(server 端併發處理)。
 * 一次過譯 3000 字,輸出要二千多個 token,很容易超出 serverless 時限;
 * 分成幾段同時譯,每段十多秒便完成,總時間與譯一段相若。
 */
export const CHUNK_CHARS = 1000;

/** 分段翻譯時的位置(第幾段/共幾段),讓模型知道前後還有內容,不要自行收尾。 */
export type TranslatePart = { index: number; total: number };

export function buildTranslatePrompt(part?: TranslatePart): string {
  const partNote = part
    ? [
        "",
        `The user's text is long, so it was split. This is part ${part.index} of ${part.total}.`,
        "Translate ONLY this part, completely. It may start or end mid-flow — do not add a greeting,",
        "a closing, or anything that is not in this part. `alternatives` must be an empty array.",
      ]
    : [];
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
    ...partNote,
  ].join("\n");
}

/**
 * 把長文切成不超過 `max` 字元的段落組,只在換行處切;單一段落太長才在句末(。！？；)切。
 * `seps[i]` 是第 i 段與第 i+1 段之間原本的分隔(空行或單一換行),合併譯文時照用,
 * 否則分段與 1. 2. 3. 的排版會走樣。
 */
export function splitForTranslation(
  text: string,
  max = CHUNK_CHARS
): { chunks: string[]; seps: string[] } {
  const t = text.trim();
  if (t.length <= max) return { chunks: [t], seps: [] };

  // 先拆成「單位」(一行,或過長行中的一句),各自記住後面接的分隔
  const units: { text: string; sep: string }[] = [];
  const parts = t.split(/(\n\s*\n|\n)/);
  for (let i = 0; i < parts.length; i += 2) {
    const line = parts[i].trim();
    const sep = /\n\s*\n/.test(parts[i + 1] ?? "") ? "\n\n" : "\n";
    if (!line) continue;
    if (line.length <= max) {
      units.push({ text: line, sep });
      continue;
    }
    // 過長的一行:按句末標點切,保留標點
    const sentences = line.match(/[^。！？；!?;]+[。！？；!?;]*/g) ?? [line];
    let buf = "";
    for (const s of sentences) {
      if (buf && buf.length + s.length > max) {
        units.push({ text: buf, sep: "" });
        buf = "";
      }
      // 單句仍然太長(沒有標點)就硬切
      let rest = s;
      while (rest.length > max) {
        units.push({ text: rest.slice(0, max), sep: "" });
        rest = rest.slice(max);
      }
      buf += rest;
    }
    if (buf) units.push({ text: buf, sep });
  }

  const chunks: string[] = [];
  const seps: string[] = [];
  let cur = "";
  let curSep = "";
  for (const u of units) {
    if (cur && cur.length + curSep.length + u.text.length > max) {
      chunks.push(cur);
      seps.push(curSep === "" ? " " : curSep);
      cur = u.text;
    } else {
      cur = cur ? cur + curSep + u.text : u.text;
    }
    curSep = u.sep;
  }
  if (cur) chunks.push(cur);
  return { chunks, seps };
}

/** 把各段譯文按原本的分隔接回一篇。 */
export function joinTranslations(parts: string[], seps: string[]): string {
  return parts
    .map((p, i) => (i === 0 ? p.trim() : (seps[i - 1] ?? "\n\n") + p.trim()))
    .join("");
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
