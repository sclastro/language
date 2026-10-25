/**
 * 主題句庫(/learn):揀主題或場景,由 AI 提供一批句子,用戶被動地讀、聽,
 * 再揀值得記的 ☆ 收藏進 SRS。與對話練習相反 —— 這裏是 AI 給 input,不用用戶先想句子。
 *
 * 刻意寫成純函數(不碰 localStorage / fetch),方便測試;server 與 client 都可以 import。
 */
import type { Level } from "./types";

/** 三種形式:常用單句、短對話、句式(附例句)。 */
export type PhraseFormat = "sentences" | "dialogue" | "patterns";

export const PHRASE_FORMATS: { id: PhraseFormat; label: string }[] = [
  { id: "sentences", label: "Useful sentences" },
  { id: "dialogue", label: "Short dialogue" },
  { id: "patterns", label: "Sentence patterns" },
];

export type PhraseExample = { en: string; zh: string };

export type PhraseItem = {
  /** 英文句子;句式則是句式本身(例如 "I was wondering if …")。 */
  en: string;
  /** 中文意思(繁體書面語)。 */
  zh: string;
  /** 用法提示(繁體中文):何時用、語氣如何。可以沒有。 */
  note?: string;
  /** 對話才有:說話的人(例如 "Waiter")。 */
  speaker?: string;
  /** 句式才有:兩至三個例句。 */
  examples?: PhraseExample[];
};

export type PhraseSet = {
  id: string;
  topic: string;
  level: Level;
  format: PhraseFormat;
  /** 模型起的標題(對話用得着);沒有就用 topic。 */
  title: string;
  items: PhraseItem[];
  at: number;
};

/** 句庫存放的 localStorage key;/learn 與 /quiz 共用。 */
export const PHRASE_SETS_KEY = "english-tutor-phrasesets-v1";

/** 本機最多保留幾批(不同步;值得記的句子用 ☆ 收藏,收藏會同步)。 */
export const MAX_SETS = 50;

/** 自訂主題的長度上限。 */
export const MAX_TOPIC_CHARS = 100;

/** 預設主題。介面一律英文;自訂主題可以用中文打。 */
export const TOPICS: string[] = [
  "Small talk with neighbours and colleagues",
  "Ordering food and drinks",
  "Shopping, returns and refunds",
  "Asking for and giving directions",
  "At the doctor’s or pharmacy",
  "Booking a hotel and checking in",
  "At the airport and on a flight",
  "Making phone calls and leaving messages",
  "Writing work emails",
  "Meetings: agreeing, disagreeing, suggesting",
  "Job interviews",
  "Talking with parents about a student",
  "Classroom English for teachers",
  "Making a complaint politely",
  "Making plans with friends",
  "Banking and paying bills",
  "Renting a flat and talking to the landlord",
  "Giving opinions and explaining reasons",
  "Apologising, thanking and responding",
  "Talking about feelings and health",
];

const LEVEL_GUIDE: Record<Level, string> = {
  beginner: "Beginner (CEFR A2): very common words, short simple sentences, present and past tense.",
  intermediate: "Intermediate (CEFR B1–B2): everyday natural English, common phrasal verbs and collocations.",
  advanced: "Advanced (CEFR C1): richer vocabulary and idiomatic but still natural, not literary.",
};

const FORMAT_GUIDE: Record<PhraseFormat, string[]> = {
  sentences: [
    "Give 10 useful, high-frequency sentences a person would really say (or hear) in this situation.",
    "Cover different functions: asking, answering, requesting, checking, reacting, ending politely.",
    'Shape: {"title": string, "items": [{"en": string, "zh": string, "note": string}]}',
  ],
  dialogue: [
    "Write one realistic short dialogue of 8–12 lines between two people in this situation.",
    "Give the two speakers role names such as \"Customer\" and \"Waiter\" (or first names).",
    "Each line is one turn of one to three short sentences. `note` explains a useful phrase in that line, or is an empty string.",
    'Shape: {"title": string, "items": [{"speaker": string, "en": string, "zh": string, "note": string}]}',
  ],
  patterns: [
    "Give 5 useful sentence patterns (frames) for this situation, e.g. \"Would you mind …?\" or \"I was wondering if …\".",
    "`en` is the pattern itself with … for the slot. Give 2–3 natural example sentences for each pattern.",
    'Shape: {"title": string, "items": [{"en": string, "zh": string, "note": string, "examples": [{"en": string, "zh": string}]}]}',
  ],
};

/**
 * 句庫 prompt。`avoid` 是同一主題已經出過的句子,要求模型不要重複 ——
 * 否則「再來一批」只會得到差不多的十句。
 */
export function buildPhrasesPrompt(opts: {
  topic: string;
  level: Level;
  format: PhraseFormat;
  avoid?: string[];
}): string {
  const avoid = (opts.avoid ?? []).slice(0, 40);
  return [
    "You are an English teacher preparing study material for an adult Hong Kong Chinese learner.",
    "The learner wants ready-made, natural English they can study, listen to and remember for real life.",
    "",
    `Topic or situation: ${opts.topic}`,
    `Level: ${LEVEL_GUIDE[opts.level]}`,
    "",
    ...FORMAT_GUIDE[opts.format],
    "",
    "Rules:",
    "- English must be natural, current, spoken English a native speaker would really use. No textbook stiffness.",
    "- `zh` is the meaning in Traditional Chinese, natural Hong Kong written Chinese (書面語, not Cantonese colloquial). Do not translate word for word.",
    "- `note` is ONE short sentence in Traditional Chinese 書面語: when to use it, the tone (polite/casual), or a common mistake to avoid. Use an empty string if nothing useful to add.",
    "- `title` is a short English title for this set (max 6 words).",
    ...(avoid.length
      ? ["- These were already given before. Do NOT repeat them or give near-copies:", ...avoid.map((a) => `  • ${a}`)]
      : []),
    "",
    "Respond with exactly ONE JSON object and nothing before or after it, no markdown.",
  ].join("\n");
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 驗證一項;英文或中文缺失就整項不要(半項比沒有更易誤導)。 */
function cleanItem(raw: unknown, format: PhraseFormat): PhraseItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const en = str(o.en);
  const zh = str(o.zh);
  if (!en || !zh) return null;
  const item: PhraseItem = { en, zh };
  const note = str(o.note);
  if (note) item.note = note;
  if (format === "dialogue") {
    const speaker = str(o.speaker);
    if (speaker) item.speaker = speaker;
  }
  if (format === "patterns") {
    const examples = (Array.isArray(o.examples) ? o.examples : [])
      .map((e) => {
        const x = (e ?? {}) as Record<string, unknown>;
        return { en: str(x.en), zh: str(x.zh) };
      })
      .filter((e) => e.en && e.zh)
      .slice(0, 3);
    if (examples.length) item.examples = examples;
  }
  return item;
}

/**
 * 找出 `"items": [` 之後,括號完整的每一個物件(會略過字串內的括號)。
 * 回覆被 max_tokens 截斷時,用它搶救前面已經完整的項目。
 */
function salvageItems(src: string): unknown[] {
  const at = src.search(/"items"\s*:\s*\[/);
  if (at < 0) return [];
  const startArr = src.indexOf("[", at);
  const out: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  for (let i = startArr + 1; i < src.length; i++) {
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
      if (depth === 0 && start >= 0) {
        try {
          out.push(JSON.parse(src.slice(start, i + 1)));
        } catch {
          /* 略過 */
        }
        start = -1;
      }
    } else if (ch === "]" && depth === 0) break;
  }
  return out;
}

/** 解析模型回覆。回 `truncated: true` 表示內容是搶救回來的(可能不齊)。 */
export function parsePhraseSet(
  raw: string,
  format: PhraseFormat
): { title: string; items: PhraseItem[]; truncated: boolean } {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      const obj = JSON.parse(text.slice(first, last + 1)) as { title?: unknown; items?: unknown };
      const items = (Array.isArray(obj.items) ? obj.items : [])
        .map((x) => cleanItem(x, format))
        .filter((x): x is PhraseItem => !!x);
      return { title: str(obj.title), items, truncated: false };
    } catch {
      /* 落去搶救 */
    }
  }
  const items = salvageItems(text)
    .map((x) => cleanItem(x, format))
    .filter((x): x is PhraseItem => !!x);
  const t = text.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  let title = "";
  if (t) {
    try {
      title = JSON.parse(`"${t[1]}"`) as string;
    } catch {
      /* ignore */
    }
  }
  return { title, items, truncated: true };
}

/** 一批句子中所有可以收藏/出題的英文句(句式連同例句)。 */
export function setSentences(set: PhraseSet): PhraseExample[] {
  return set.items.flatMap((it) => [{ en: it.en, zh: it.zh }, ...(it.examples ?? [])]);
}

/** 同一主題最近出過的句子,傳給 prompt 避免重複。 */
export function recentForTopic(sets: PhraseSet[], topic: string, limit = 40): string[] {
  const key = topic.trim().toLowerCase();
  return sets
    .filter((s) => s.topic.trim().toLowerCase() === key)
    .flatMap((s) => s.items.map((i) => i.en))
    .slice(0, limit);
}

/** 加入清單:最新在前,超出上限就丟最舊的。 */
export function addPhraseSet(list: PhraseSet[], set: PhraseSet, max = MAX_SETS): PhraseSet[] {
  return [set, ...list.filter((s) => s.id !== set.id)].slice(0, max);
}

function isLevel(v: unknown): v is Level {
  return v === "beginner" || v === "intermediate" || v === "advanced";
}

function isFormat(v: unknown): v is PhraseFormat {
  return v === "sentences" || v === "dialogue" || v === "patterns";
}

/** 由 localStorage 讀出的資料可能損壞或來自舊版,逐項驗證。 */
export function sanitizePhraseSets(raw: unknown): PhraseSet[] {
  if (!Array.isArray(raw)) return [];
  const out: PhraseSet[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const s = r as Record<string, unknown>;
    if (typeof s.id !== "string" || typeof s.at !== "number" || !isFormat(s.format)) continue;
    const items = (Array.isArray(s.items) ? s.items : [])
      .map((x) => cleanItem(x, s.format as PhraseFormat))
      .filter((x): x is PhraseItem => !!x);
    if (!items.length) continue;
    out.push({
      id: s.id,
      topic: str(s.topic),
      level: isLevel(s.level) ? s.level : "intermediate",
      format: s.format,
      title: str(s.title),
      items,
      at: s.at,
    });
  }
  return out.slice(0, MAX_SETS);
}
