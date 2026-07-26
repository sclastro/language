import { describe, it, expect } from "vitest";
import { initialSrs, reviewSrs, isDue } from "@/lib/srs";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

describe("SRS 排程", () => {
  it("未複習過就當即刻到期", () => {
    expect(isDue(undefined, NOW - 1, NOW)).toBe(true);
  });

  it("連續記得 → 間隔逐級拉長 1→3→7→14→30→60 日", () => {
    let s = initialSrs(NOW);
    const got: number[] = [];
    for (let i = 0; i < 6; i++) {
      s = reviewSrs(s, true, NOW);
      got.push(s.interval);
    }
    expect(got).toEqual([1, 3, 7, 14, 30, 60]);
    expect(s.due).toBe(NOW + 60 * DAY);
  });

  it("到咗最高一級唔會再向上爆", () => {
    let s = initialSrs(NOW);
    for (let i = 0; i < 10; i++) s = reviewSrs(s, true, NOW);
    expect(s.interval).toBe(60);
  });

  it("唔記得 → 重置,10 分鐘後再出", () => {
    let s = initialSrs(NOW);
    s = reviewSrs(s, true, NOW);
    s = reviewSrs(s, true, NOW);
    expect(s.reps).toBe(2);

    s = reviewSrs(s, false, NOW);
    expect(s.reps).toBe(0);
    expect(s.interval).toBe(0);
    expect(s.due).toBe(NOW + 10 * 60 * 1000);
  });

  it("未到期就唔算 due,到咗就算", () => {
    const s = reviewSrs(initialSrs(NOW), true, NOW); // 1 日後
    expect(isDue(s, NOW, NOW + DAY - 1)).toBe(false);
    expect(isDue(s, NOW, NOW + DAY)).toBe(true);
  });
});
