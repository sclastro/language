/**
 * 語音朗讀的長度上限。
 *
 * ⚠️ 兩條路徑必須用同一個上限。曾經 `/api/tts`(🔊 朗讀、▶ Play selected)
 * 以 600 **字元** 截斷,而 `/api/export`(⬇ MP3)完全沒有上限 ——
 * 而匯出又會優先重用播放時的快取,結果同一句長句「播過先匯出」得到截斷版、
 * 「未播過就匯出」得到完整版,同一項目兩種結果。
 *
 * 現在統一為 **2000 個英文字**(以空白分隔的字詞,不是字元),而且截斷時
 * 會回報,不再靜靜截短。
 */

export const TTS_MAX_WORDS = 2000;

/** 數英文字數(以空白分隔)。 */
export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** 截到最多 `max` 個字;回報有沒有真的截過。 */
export function limitWords(
  text: string,
  max = TTS_MAX_WORDS
): { text: string; truncated: boolean } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return { text: text.trim(), truncated: false };
  return { text: words.slice(0, max).join(" "), truncated: true };
}
