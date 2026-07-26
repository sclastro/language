import { describe, it, expect } from "vitest";
import { scorePronunciation } from "@/lib/pron";

describe("scorePronunciation", () => {
  it("讀啱晒 = 100 分,全部字綠色", () => {
    const r = scorePronunciation("I went to the cinema", "I went to the cinema");
    expect(r.score).toBe(100);
    expect(r.words.every((w) => w.ok)).toBe(true);
  });

  it("漏咗一個字,只有嗰個字標紅", () => {
    const r = scorePronunciation("I went to the cinema", "I went to cinema");
    expect(r.words.map((w) => w.ok)).toEqual([true, true, true, false, true]);
    expect(r.score).toBe(80);
  });

  it("大小寫同標點唔影響比對", () => {
    const r = scorePronunciation("Hello, world!", "hello world");
    expect(r.score).toBe(100);
  });

  // 迴歸:連字號嘅字會拆成兩個 token,以前會令之後所有字紅綠錯位
  it("連字號嘅字唔會令後面嘅字錯位", () => {
    const target = "It is well-known today";
    const perfect = scorePronunciation(target, target);
    expect(perfect.words.map((w) => w.word)).toEqual(["It", "is", "well-known", "today"]);
    expect(perfect.words.every((w) => w.ok)).toBe(true);

    // 漏咗最後一個字 → 應該係 "today" 標紅,唔係 "well-known"
    const missLast = scorePronunciation(target, "It is well-known");
    const byWord = Object.fromEntries(missLast.words.map((w) => [w.word, w.ok]));
    expect(byWord["well-known"]).toBe(true);
    expect(byWord["today"]).toBe(false);
  });

  it("連字號字讀甩一半就當嗰個字錯", () => {
    const r = scorePronunciation("It is well-known", "It is well");
    const byWord = Object.fromEntries(r.words.map((w) => [w.word, w.ok]));
    expect(byWord["well-known"]).toBe(false);
  });

  it("完全唔啱 = 0 分", () => {
    const r = scorePronunciation("apple banana", "zebra");
    expect(r.score).toBe(0);
  });
});
