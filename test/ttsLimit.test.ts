import { describe, it, expect } from "vitest";
import { countWords, limitWords, TTS_MAX_WORDS } from "@/lib/ttsLimit";

describe("countWords", () => {
  it("以空白分隔數字數", () => {
    expect(countWords("I went to the cinema")).toBe(5);
  });
  it("多重空白/換行都當一個分隔", () => {
    expect(countWords("one   two\n\nthree")).toBe(3);
  });
  it("空字串回 0", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
  it("數的是字,不是字元", () => {
    // 一個 600 字元的長字只算一個字
    expect(countWords("a".repeat(600))).toBe(1);
  });
});

describe("limitWords", () => {
  it("未超額就原封不動,並回報冇截過", () => {
    const r = limitWords("Good morning, 3P!", 2000);
    expect(r).toEqual({ text: "Good morning, 3P!", truncated: false });
  });

  it("剛好等於上限唔算截斷", () => {
    const words = Array.from({ length: 10 }, (_, i) => `w${i}`).join(" ");
    expect(limitWords(words, 10).truncated).toBe(false);
  });

  it("超額就截到上限,並回報截過", () => {
    const words = Array.from({ length: 12 }, (_, i) => `w${i}`).join(" ");
    const r = limitWords(words, 10);
    expect(r.truncated).toBe(true);
    expect(countWords(r.text)).toBe(10);
    expect(r.text.endsWith("w9")).toBe(true);
  });

  // 舊版以 600 字元截斷,長句會被腰斬;現在以字數計,一般句子完全碰不到
  it("以前會被 600 字元砍斷的長句,現在完整保留", () => {
    const long = Array.from({ length: 150 }, () => "sentence").join(" "); // ~1300 字元
    expect(long.length).toBeGreaterThan(600);
    const r = limitWords(long);
    expect(r.truncated).toBe(false);
    expect(r.text).toBe(long);
  });

  it("預設上限係 2000 個字", () => {
    expect(TTS_MAX_WORDS).toBe(2000);
    const over = Array.from({ length: 2001 }, () => "w").join(" ");
    expect(limitWords(over).truncated).toBe(true);
    expect(countWords(limitWords(over).text)).toBe(2000);
  });

  it("前後空白會修掉", () => {
    expect(limitWords("  hello  ").text).toBe("hello");
  });
});
