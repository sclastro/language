/**
 * 篇章轉語音(/listen):把用戶貼上的英文原封不動讀出來。
 *
 * 一大段文字一次過交給 TTS 會超出 serverless 時限(60 秒),所以按段落分批生成,
 * 前端逐段接駁播放,下載時再由 /api/export 串接成一個 MP3。
 * ⚠️ 只可在段落或句末切開,不可改動任何字 —— 這個功能的重點是「完全照原文」。
 * 刻意寫成純函數,方便測試。
 */
import { countWords } from "./ttsLimit";

/** 每段最多幾個字。太長生成會慢(亦易逾時);太短則段與段之間的停頓變多。 */
export const CHUNK_WORDS = 180;

/**
 * 第一段只取約這麼多字(以句末為界)。實測 elevenlabs-v3 生成 180 字要約 26 秒,
 * 撳 Play 後靜候這麼久太難受;50 字約 8–10 秒便有聲,其餘各段在播放期間於背景生成。
 */
export const FIRST_CHUNK_WORDS = 50;

/** 每篇上限:約 20 分鐘朗讀。分段後最多約 20–25 段,在 /api/export 的上限之內。 */
export const MAX_PASSAGE_WORDS = 3000;

/** 歷史最多保留幾篇(只存本機;語音已存 IndexedDB,重聽不再扣 points)。 */
export const MAX_LISTEN_HISTORY = 20;

export type ListenEntry = { id: string; text: string; at: number };

/** 只在「句末標點 + 空白」處切:"3.5"、"e.g.x" 之類中間沒有空白的不會被拆開。 */
const SENTENCE_END = /(?<=[.!?]["'”’)\]]*)\s+/;

/** 把一段過長的段落按句末(. ! ? 後接空白)切成不超過 `max` 字的幾份。 */
function splitParagraph(p: string, max: number): string[] {
  const sentences = p.split(SENTENCE_END);
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf && countWords(buf) + countWords(s) > max) {
      out.push(buf.trim());
      buf = "";
    }
    // 單句仍然超長(例如沒有標點的一大段)就按字數硬切
    const words = s.trim().split(/\s+/).filter(Boolean);
    while (words.length > max) {
      if (buf.trim()) {
        out.push(buf.trim());
        buf = "";
      }
      out.push(words.splice(0, max).join(" "));
    }
    if (words.length) buf += (buf ? " " : "") + words.join(" ");
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/**
 * 切成適合 TTS 的段:先按段落,短段落合併(段落之間保留空行,朗讀時自然停頓),
 * 過長段落則按句子切開。結果只會改動段落之間的空白,不會改動任何字。
 */
export function splitPassage(
  text: string,
  max = CHUNK_WORDS,
  firstMax = FIRST_CHUNK_WORDS
): string[] {
  const paras = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (countWords(p) > max ? splitParagraph(p, max) : [p]));
  const chunks: string[] = [];
  // 第一段刻意短:由第一個段落取句子,直至約 firstMax 字(最少一句),好讓朗讀盡快開始
  if (paras.length && countWords(paras.join(" ")) > firstMax) {
    const sentences = paras[0].split(SENTENCE_END);
    let n = 0;
    let words = 0;
    while (n < sentences.length && (n === 0 || words + countWords(sentences[n]) <= firstMax)) {
      words += countWords(sentences[n]);
      n++;
    }
    chunks.push(sentences.slice(0, n).join(" "));
    const rest = sentences.slice(n).join(" ");
    paras.splice(0, 1, ...(rest ? [rest] : []));
  }
  let cur = "";
  for (const p of paras) {
    if (cur && countWords(cur) + countWords(p) > max) {
      chunks.push(cur);
      cur = p;
    } else {
      cur = cur ? `${cur}\n\n${p}` : p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** 歷史清單上顯示的標題:第一行的頭幾個字。 */
export function passageTitle(text: string, words = 8): string {
  const first = text.trim().split(/\n/)[0] ?? "";
  const w = first.split(/\s+/).filter(Boolean);
  return w.length > words ? w.slice(0, words).join(" ") + "…" : w.join(" ");
}

/** 加入歷史:最新在前,同一篇只留一份,超出上限就丟最舊的。 */
export function addListenHistory(
  list: ListenEntry[],
  entry: ListenEntry,
  max = MAX_LISTEN_HISTORY
): ListenEntry[] {
  const key = entry.text.trim();
  return [entry, ...list.filter((e) => e.text.trim() !== key)].slice(0, max);
}

/** 由 localStorage 讀出的資料可能損壞,逐項驗證。 */
export function sanitizeListenHistory(raw: unknown): ListenEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is ListenEntry =>
        !!e && typeof e.id === "string" && typeof e.text === "string" && typeof e.at === "number"
    )
    .slice(0, MAX_LISTEN_HISTORY);
}
