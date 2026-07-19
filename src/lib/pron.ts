/**
 * 發音練習評分:將你讀出嚟(STT 轉錄)嘅字,同目標句逐字比對。
 * 用 LCS 對齊,綠色 = 讀啱,紅色 = 漏咗/讀錯。純本地計算,唔使 AI。
 */
export type PronWord = { word: string; ok: boolean };
export type PronResult = { words: PronWord[]; score: number; heard: string };

function norm(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
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

  // 將 norm 後嘅標記映射返顯示用嘅原字(位置一一對應:norm 唔會刪走整個字,除非佢冇字母)
  const words: PronWord[] = [];
  let k = 0;
  for (const w of targetWords) {
    const hasAlpha = /[a-zA-Z0-9]/.test(w);
    if (!hasAlpha) {
      words.push({ word: w, ok: true });
      continue;
    }
    words.push({ word: w, ok: matched[k] ?? false });
    k++;
  }
  const total = matched.length || 1;
  const score = Math.round((matched.filter(Boolean).length / total) * 100);
  return { words, score, heard };
}
