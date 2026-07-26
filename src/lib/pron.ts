/**
 * 發音練習評分:將你讀出嚟(STT 轉錄)嘅字,同目標句逐字比對。
 * 用 LCS 對齊,綠色 = 讀啱,紅色 = 漏咗/讀錯。純本地計算,唔使 AI。
 */
export type PronWord = { word: string; ok: boolean };
export type PronResult = { words: PronWord[]; score: number; heard: string };

/** 將一個顯示用嘅字,轉成 0 個或多個比對用 token(例如 "well-known" → ["well","known"])。 */
function tokenize(word: string): string[] {
  return word
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function norm(s: string): string[] {
  return s.split(/\s+/).filter(Boolean).flatMap(tokenize);
}

export function scorePronunciation(target: string, heard: string): PronResult {
  const t = norm(target);
  const h = norm(heard);
  const targetWords = target.split(/\s+/).filter(Boolean);

  // LCS table
  const n = t.length;
  const m = h.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = t[i] === h[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // 回溯,標記 target 每個字有冇 match
  const matched = new Array<boolean>(n).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (t[i] === h[j]) {
      matched[i] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }

  // 將 token 層面嘅標記,對應返顯示用嘅原字。
  // ⚠️ 一個顯示字可以拆成多過一個 token(如 "well-known"),所以要用實際 token 數行位,
  //    唔可以每個字加一 —— 否則之後所有字嘅紅綠都會錯位。
  const words: PronWord[] = [];
  let k = 0;
  for (const w of targetWords) {
    const count = tokenize(w).length;
    if (count === 0) {
      // 純標點(例如單獨一個 "—"),唔計分
      words.push({ word: w, ok: true });
      continue;
    }
    const slice = matched.slice(k, k + count);
    words.push({ word: w, ok: slice.length > 0 && slice.every(Boolean) });
    k += count;
  }
  const total = matched.length || 1;
  const score = Math.round((matched.filter(Boolean).length / total) * 100);
  return { words, score, heard };
}
