import { describe, it, expect } from "vitest";
import {
  splitPassage,
  passageTitle,
  addListenHistory,
  sanitizeListenHistory,
  CHUNK_WORDS,
  MAX_PASSAGE_WORDS,
} from "@/lib/listen";
import { countWords } from "@/lib/ttsLimit";

const words = (n: number, w = "word") => Array.from({ length: n }, () => w).join(" ");

/** 只比較字詞(空白不算):篇章轉語音不可改動任何字。 */
const tokens = (s: string) => s.split(/\s+/).filter(Boolean);

describe("splitPassage", () => {
  it("短文整篇一段,原文不變", () => {
    const t = "Hello there.\n\nThis is my second paragraph.";
    expect(splitPassage(t)).toEqual([t]);
  });

  it("短段落合併,段落之間保留空行", () => {
    const t = `${words(100, "a")}.\n\n${words(60, "b")}.\n\n${words(100, "c")}.`;
    const chunks = splitPassage(t);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toContain("\n\n");
    expect(chunks.every((c) => countWords(c) <= CHUNK_WORDS)).toBe(true);
  });

  it("過長段落在句末切開,所有字依次保留", () => {
    const sentence = "This is a fairly ordinary sentence with ten words. ";
    const t = sentence.repeat(50).trim(); // 500 字,一段
    const chunks = splitPassage(t);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => countWords(c) <= CHUNK_WORDS)).toBe(true);
    expect(chunks.every((c) => c.endsWith("."))).toBe(true);
    expect(tokens(chunks.join(" "))).toEqual(tokens(t));
  });

  // 只在「標點 + 空白」處切:3.5 不可變成 "3. 5"
  it("不會拆開小數或縮寫中間的點", () => {
    const t = `The price is 3.5 dollars. ${words(300)}`;
    const joined = splitPassage(t).join(" ");
    expect(joined).toContain("3.5 dollars");
    expect(tokens(joined)).toEqual(tokens(t));
  });

  it("沒有標點的超長段落按字數硬切,不遺失", () => {
    const t = words(400);
    const chunks = splitPassage(t);
    expect(chunks.every((c) => countWords(c) <= CHUNK_WORDS)).toBe(true);
    expect(tokens(chunks.join(" "))).toEqual(tokens(t));
  });

  it("上限篇幅分段後不超過 /api/export 的 40 段", () => {
    const para = `${words(95)}.`;
    const t = Array.from({ length: Math.floor(MAX_PASSAGE_WORDS / 95) }, () => para).join("\n\n");
    expect(splitPassage(t).length).toBeLessThanOrEqual(40);
  });
});

describe("listen history", () => {
  it("標題取第一行頭幾個字", () => {
    expect(passageTitle("One two three four five six seven eight nine\nNext")).toBe(
      "One two three four five six seven eight…"
    );
  });

  it("同一篇只留最新一份", () => {
    const a = { id: "1", text: "Hello", at: 1 };
    const b = { id: "2", text: "Hello ", at: 2 };
    expect(addListenHistory([a], b)).toEqual([b]);
  });

  it("壞資料逐項略去", () => {
    expect(sanitizeListenHistory([{ id: "1", text: "ok", at: 1 }, { id: 2 }, null, "x"])).toEqual([
      { id: "1", text: "ok", at: 1 },
    ]);
    expect(sanitizeListenHistory("nope")).toEqual([]);
  });
});
