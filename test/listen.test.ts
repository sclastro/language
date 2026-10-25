import { describe, it, expect } from "vitest";
import {
  splitPassage,
  passageTitle,
  addListenHistory,
  sanitizeListenHistory,
  CHUNK_WORDS,
  FIRST_CHUNK_WORDS,
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
    expect(chunks[1]).toContain("\n\n");
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

// 實測 180 字要生成約 26 秒;第一段短,撳 Play 後約 10 秒內便有聲
describe("第一段刻意短", () => {
  it("由句子組成,約 FIRST_CHUNK_WORDS 字,其餘照常分段,不遺失任何字", () => {
    const sentence = "This is a fairly ordinary sentence with ten words.";
    const t = Array.from({ length: 3 }, () => Array(12).fill(sentence).join(" ")).join("\n\n");
    const chunks = splitPassage(t);
    const n = countWords(chunks[0]); // 每句 9 字 → 5 句 = 45 字(再加一句就超過 50)
    expect(n).toBeLessThanOrEqual(FIRST_CHUNK_WORDS);
    expect(n).toBeGreaterThan(FIRST_CHUNK_WORDS - 10);
    expect(chunks[0].endsWith(".")).toBe(true);
    expect(tokens(chunks.join(" "))).toEqual(tokens(t));
  });

  it("首句本身已超過上限也整句保留,不在句中切開", () => {
    const t = `${words(70)}. ${words(100, "b")}.`;
    expect(countWords(splitPassage(t)[0])).toBe(70);
  });

  it("開首是短稱呼(例如 Dear parents,)就自成一段", () => {
    const t = `Dear parents,\n\n${words(100)}.`;
    expect(splitPassage(t)[0]).toBe("Dear parents,");
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
