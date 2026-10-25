/**
 * Quiz(/quiz):用已收藏的句子,或某一批句庫,出三種題:
 *  - recall:看中文,打出英文,揭曉後逐字比對(LCS,見 pron.ts),再自評。
 *  - cloze :句子挖去一個關鍵字,填回去。純本地評分,不扣 points。
 *  - mcq   :四揀一。干擾項由模型整批一次生成,並快取於本機(同一句下次不再扣 points)。
 *
 * 刻意寫成純函數;隨機數經參數傳入,測試才可以重現。
 */
import type { SavedItem } from "./savedStore";

export type QuizType = "recall" | "cloze" | "mcq";
export type QuizMode = QuizType | "mix";

export const QUIZ_MODES: { id: QuizMode; label: string }[] = [
  { id: "mix", label: "Mixed" },
  { id: "recall", label: "Chinese → English" },
  { id: "cloze", label: "Fill in the blank" },
  { id: "mcq", label: "Multiple choice" },
];

/** 題目來源中的一句。 */
export type QuizCard = {
  en: string;
  /** 中文意思;沒有的話不可出 recall 題。 */
  zh?: string;
  note?: string;
  /** 來自收藏的才有;答錯時用來把它排回今日複習。 */
  savedId?: string;
};

export type Cloze = { before: string; answer: string; after: string };

export type Question = {
  type: QuizType;
  card: QuizCard;
  cloze?: Cloze;
  /** mcq:四個選項(已洗牌),其中一個等於 card.en。 */
  options?: string[];
};

type Rng = () => number;

export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 太常見、挖空了也學不到甚麼的字。 */
const STOPWORDS = new Set(
  (
    "the a an and or but if so to of in on at for from with by as is am are was were be been being " +
    "it its this that these those there here i you he she we they me him her us them my your his our their " +
    "do does did have has had will would can could shall should may might must not no yes very just " +
    "what when where who why how which than then also too about into over"
  ).split(" ")
);

/**
 * 揀一個關鍵字挖空。只揀純字母、四個字母或以上、而且不是常用虛詞的字;
 * 句子少於四個字或找不到合適的字就回 null(這句不適合出填充題)。
 */
export function makeCloze(sentence: string, rng: Rng = Math.random): Cloze | null {
  const tokens = sentence.split(/(\s+)/);
  const wordCount = tokens.filter((t) => t.trim()).length;
  if (wordCount < 4) return null;
  const candidates: { idx: number; pre: string; word: string; post: string }[] = [];
  tokens.forEach((t, idx) => {
    const m = t.match(/^([^A-Za-z]*)([A-Za-z]+(?:['’-][A-Za-z]+)*)([^A-Za-z]*)$/);
    if (!m) return;
    const word = m[2];
    if (word.length < 4 || /['’]/.test(word) || STOPWORDS.has(word.toLowerCase())) return;
    candidates.push({ idx, pre: m[1], word, post: m[3] });
  });
  if (!candidates.length) return null;
  const c = candidates[Math.floor(rng() * candidates.length)];
  return {
    before: tokens.slice(0, c.idx).join("") + c.pre,
    answer: c.word,
    after: c.post + tokens.slice(c.idx + 1).join(""),
  };
}

/** 填充題評分:不分大小寫,略去前後標點及空白。 */
export function checkCloze(answer: string, input: string): boolean {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[’]/g, "'")
      .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  return !!norm(input) && norm(input) === norm(answer);
}

/** 由收藏轉成題目來源。生字只有一個字,出不到這三種題,所以略去。 */
export function cardsFromSaved(items: SavedItem[]): QuizCard[] {
  return items
    .filter((i) => i.kind !== "vocab" && i.text.trim())
    .map((i) => {
      // 只有這兩類的 original 是中文;其他類別的 original 是你當時寫錯的英文,不可當成中文提示
      const hasZh = i.kind === "translation" || i.kind === "phrase";
      return {
        en: i.text.trim(),
        zh: hasZh ? i.original : undefined,
        note: i.kind === "phrase" ? i.explanation : undefined,
        savedId: i.id,
      };
    });
}

/** 這張卡可以出哪幾種題。 */
export function eligibleTypes(card: QuizCard): QuizType[] {
  const out: QuizType[] = [];
  if (card.zh) out.push("recall");
  if (makeCloze(card.en, () => 0)) out.push("cloze");
  // mcq 太長的話四個選項會佔滿整個畫面,所以只用於一般長度的句子
  if (card.en.split(/\s+/).length <= 30) out.push("mcq");
  return out;
}

/**
 * 揀題:由 `cards` 隨機抽最多 `count` 張,按 `mode` 決定題型。
 * 指定題型時只會抽合適的卡;mix 則每張由它合適的題型中隨機揀一種。
 * mcq 的選項此時未有,由 `attachOptions` 補上(干擾項要先向模型取)。
 */
export function pickQuestions(
  cards: QuizCard[],
  mode: QuizMode,
  count: number,
  rng: Rng = Math.random
): Question[] {
  const out: Question[] = [];
  for (const card of shuffle(cards, rng)) {
    if (out.length >= count) break;
    const types = eligibleTypes(card);
    const type: QuizType | undefined =
      mode === "mix" ? types[Math.floor(rng() * types.length)] : types.includes(mode) ? mode : undefined;
    if (!type) continue;
    const q: Question = { type, card };
    if (type === "cloze") q.cloze = makeCloze(card.en, rng) ?? undefined;
    out.push(q);
  }
  return out;
}

/**
 * 為 mcq 題補上選項。缺干擾項的題目(模型未回或回得不齊)改出其他題型,
 * 沒有其他題型可出就剔除 —— 寧願少一題,也不要出一條只有一個選項的題。
 */
export function attachOptions(
  questions: Question[],
  distractors: Record<string, string[]>,
  rng: Rng = Math.random
): Question[] {
  const out: Question[] = [];
  for (const q of questions) {
    if (q.type !== "mcq") {
      out.push(q);
      continue;
    }
    const d = distractors[q.card.en];
    if (d && d.length >= 3) {
      out.push({ ...q, options: shuffle([q.card.en, ...d.slice(0, 3)], rng) });
      continue;
    }
    const alt = eligibleTypes(q.card).filter((t) => t !== "mcq")[0];
    if (alt === "cloze") out.push({ type: "cloze", card: q.card, cloze: makeCloze(q.card.en, rng) ?? undefined });
    else if (alt === "recall") out.push({ type: "recall", card: q.card });
  }
  return out;
}

/** 干擾項 prompt:一次為整批句子生成,每句三個。 */
export function buildDistractorPrompt(): string {
  return [
    "You write wrong options for English multiple-choice questions for a Hong Kong Chinese learner.",
    "For EACH input item (an English sentence, maybe with its Chinese meaning), write exactly 3 wrong options.",
    "Each wrong option must look very similar to the correct sentence (same length and most of the same words),",
    "but be clearly wrong to someone who knows the right answer. Use mistakes Chinese speakers really make:",
    "a grammar error (tense, article, preposition, word order, plural), an unnatural word-for-word translation",
    "from Chinese, a wrong collocation, or a small change that gives a different meaning.",
    "NEVER write another acceptable way to say the sentence. Each wrong option must be different from the others.",
    // 實測:模型會只改時態(wanted → want)或換一個介詞(during → in),結果仍是正確英文,
    // 學習者揀了反而被判錯。所以要求它逐個自我檢查。
    "Careful: changing only the tense (wanted → want) or swapping one preposition (during → in) often still gives",
    "correct English. Check every wrong option: if a native speaker would accept it as correct and natural, replace it",
    "with one that is definitely wrong.",
    "",
    'Respond with exactly ONE JSON object and nothing else: {"distractors": [[string, string, string], ...]}',
    "with one inner array per input item, in the same order.",
  ].join("\n");
}

/** 解析干擾項,與輸入按次序對齊;某一句的不合格(少於三個、與答案相同)就是 null。 */
export function parseDistractors(raw: string, answers: string[]): (string[] | null)[] {
  let arr: unknown[] = [];
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      const obj = JSON.parse(raw.slice(first, last + 1)) as { distractors?: unknown };
      if (Array.isArray(obj.distractors)) arr = obj.distractors;
    } catch {
      /* 全部當失敗 */
    }
  }
  const norm = (s: string) => s.trim().toLowerCase().replace(/[.!?]+$/, "");
  return answers.map((ans, i) => {
    const list = arr[i];
    if (!Array.isArray(list)) return null;
    const seen = new Set([norm(ans)]);
    const ok: string[] = [];
    for (const x of list) {
      if (typeof x !== "string" || !x.trim()) continue;
      const k = norm(x);
      if (seen.has(k)) continue;
      seen.add(k);
      ok.push(x.trim());
    }
    return ok.length >= 3 ? ok.slice(0, 3) : null;
  });
}

/** 干擾項快取最多保留幾句(只存本機)。 */
export const MAX_DISTRACTOR_CACHE = 500;

/** 加入快取;超出上限就丟最早加入的。 */
export function mergeDistractorCache(
  cache: Record<string, string[]>,
  add: Record<string, string[]>,
  max = MAX_DISTRACTOR_CACHE
): Record<string, string[]> {
  const entries = [...Object.entries(cache).filter(([k]) => !(k in add)), ...Object.entries(add)];
  return Object.fromEntries(entries.slice(-max));
}
