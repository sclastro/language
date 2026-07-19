/**
 * 間隔重複(SRS)— 簡化版 SM-2:
 * 記得 → 下次間隔跳去下一級(1→3→7→14→30→60 日);
 * 唔記得 → 重置,10 分鐘後再喺今日隊列出現。
 */
export type SrsState = {
  due: number; // 下次複習時間 (ms)
  reps: number; // 連續記得次數
  interval: number; // 而家間隔(日)
};

const INTERVALS = [1, 3, 7, 14, 30, 60];
const DAY = 24 * 60 * 60 * 1000;

export function initialSrs(savedAt: number): SrsState {
  return { due: savedAt, reps: 0, interval: 0 };
}

export function reviewSrs(srs: SrsState, remembered: boolean, now = Date.now()): SrsState {
  if (!remembered) {
    return { due: now + 10 * 60 * 1000, reps: 0, interval: 0 };
  }
  const reps = Math.min(srs.reps + 1, INTERVALS.length);
  const interval = INTERVALS[reps - 1];
  return { due: now + interval * DAY, reps, interval };
}

export function isDue(srs: SrsState | undefined, savedAt: number, now = Date.now()): boolean {
  return (srs?.due ?? savedAt) <= now;
}
