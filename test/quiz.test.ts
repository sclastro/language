import { describe, it, expect } from "vitest";
import {
  makeCloze,
  checkCloze,
  cardsFromSaved,
  eligibleTypes,
  pickQuestions,
  attachOptions,
  parseDistractors,
  buildDistractorPrompt,
  mergeDistractorCache,
  shuffle,
  type QuizCard,
} from "@/lib/quiz";
import type { SavedItem } from "@/lib/savedStore";

/** 可重現的「隨機數」。 */
function seq(...vals: number[]) {
  let i = 0;
  return () => vals[i++ % vals.length];
}

describe("makeCloze", () => {
  it("挖去一個關鍵字,前後文字及標點保持原樣", () => {
    const c = makeCloze("Could you book a table for two?", () => 0)!;
    expect(c.answer).toBe("book"); // "Could" 是虛詞,不挖
    const c2 = makeCloze("Could you book a table for two?", () => 0.99)!;
    expect(c2.answer).toBe("table");
    expect(c2.before + c2.answer + c2.after).toBe("Could you book a table for two?");
  });

  it("不挖虛詞、短字或帶撇號的字", () => {
    const c = makeCloze("I don't think that is right", () => 0)!;
    expect(c.answer).toBe("think");
  });

  it("太短或找不到合適的字就不出題", () => {
    expect(makeCloze("Thank you.")).toBeNull();
    expect(makeCloze("It is so on")).toBeNull();
  });

  it("checkCloze 不分大小寫,略去前後標點", () => {
    expect(checkCloze("Table", " table. ")).toBe(true);
    expect(checkCloze("table", "tables")).toBe(false);
    expect(checkCloze("table", "")).toBe(false);
  });
});

describe("cardsFromSaved", () => {
  const base = { id: "1", savedAt: 1 };
  it("只有 translation / phrase 的 original 當作中文提示", () => {
    const items: SavedItem[] = [
      { ...base, id: "a", text: "See you soon.", kind: "phrase", original: "遲些見。", explanation: "道別" },
      { ...base, id: "b", text: "I went home.", kind: "correction", original: "I go home yesterday." },
      { ...base, id: "c", text: "run", kind: "vocab" },
    ];
    const cards = cardsFromSaved(items);
    expect(cards).toEqual([
      { en: "See you soon.", zh: "遲些見。", note: "道別", savedId: "a" },
      { en: "I went home.", zh: undefined, note: undefined, savedId: "b" },
    ]);
  });
});

describe("pickQuestions / attachOptions", () => {
  const withZh: QuizCard = { en: "Could you book a table for two?", zh: "可以訂一張兩人枱嗎?" };
  const noZh: QuizCard = { en: "I really enjoyed the dinner tonight." };

  it("沒有中文的卡不出 recall", () => {
    expect(eligibleTypes(noZh)).not.toContain("recall");
    expect(eligibleTypes(withZh)).toEqual(["recall", "cloze", "mcq"]);
    expect(pickQuestions([noZh], "recall", 5)).toEqual([]);
  });

  it("不超過指定題數", () => {
    const cards = Array.from({ length: 8 }, (_, i) => ({ ...withZh, en: `${withZh.en} ${i}` }));
    expect(pickQuestions(cards, "mix", 5)).toHaveLength(5);
  });

  it("mcq 補上四個選項,其中一個是答案", () => {
    const qs = pickQuestions([withZh], "mcq", 1);
    const [q] = attachOptions(qs, { [withZh.en]: ["x1", "x2", "x3"] }, seq(0.3));
    expect(q.options).toHaveLength(4);
    expect(q.options).toContain(withZh.en);
  });

  // 寧願換題型或少一題,不出一條只有一個選項的題
  it("缺干擾項的 mcq 改出其他題型", () => {
    const qs = pickQuestions([withZh, { en: "Hi there." }], "mcq", 2);
    const out = attachOptions(qs, {});
    expect(out.map((q) => q.type)).toEqual(["recall"]);
  });
});

describe("parseDistractors", () => {
  it("按次序對齊,與答案相同或不足三個的作廢", () => {
    const raw = '{"distractors":[["a","b","c"],["Right answer.","x","y"],["p","q","r","s"]]}';
    expect(parseDistractors(raw, ["A1", "right answer", "B2"])).toEqual([
      ["a", "b", "c"],
      null,
      ["p", "q", "r"],
    ]);
  });

  it("不是 JSON 就全部作廢", () => {
    expect(parseDistractors("sorry", ["a", "b"])).toEqual([null, null]);
  });
});

describe("mergeDistractorCache / shuffle", () => {
  it("超出上限丟最早的", () => {
    const out = mergeDistractorCache({ a: ["1"], b: ["2"] }, { c: ["3"] }, 2);
    expect(Object.keys(out)).toEqual(["b", "c"]);
  });

  it("shuffle 不改動原陣列,元素不變", () => {
    const a = [1, 2, 3, 4];
    const b = shuffle(a, seq(0.5, 0.1, 0.9));
    expect(a).toEqual([1, 2, 3, 4]);
    expect([...b].sort()).toEqual([1, 2, 3, 4]);
  });
});

// 實測:模型只改時態(wanted → want)或換介詞(during → in),結果仍是正確英文
it("干擾項 prompt 要求自我檢查,剔除其實正確的選項", () => {
  const p = buildDistractorPrompt();
  expect(p).toContain("NEVER write another acceptable way");
  expect(p).toContain("Check every wrong option");
});
