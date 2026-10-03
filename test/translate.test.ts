import { describe, it, expect } from "vitest";
import {
  buildTranslatePrompt,
  parseTranslation,
  addToHistory,
  sanitizeHistory,
  MAX_HISTORY,
  type TranslationEntry,
} from "@/lib/translate";

describe("buildTranslatePrompt", () => {
  const p = buildTranslatePrompt();

  it("要看得懂廣東話口語句式", () => {
    expect(p).toContain("Cantonese colloquial");
  });

  it("要求簡單、口語、短句,但不浮誇", () => {
    expect(p).toContain("Everyday spoken English");
    expect(p).toContain("Short, clear sentences");
    expect(p).toContain("no heavy slang");
  });

  it("只翻譯,不回答句中的問題", () => {
    expect(p).toContain("Do not answer questions in the text");
  });

  it("JSON 形狀", () => {
    expect(p).toContain('{"english": string, "alternatives": [string]}');
  });
});

describe("parseTranslation", () => {
  it("解析正常 JSON", () => {
    const r = parseTranslation(
      '{"english":"Is there an MTR station near here?","alternatives":["Where\'s the nearest MTR station?"]}'
    );
    expect(r.english).toBe("Is there an MTR station near here?");
    expect(r.alternatives).toEqual(["Where's the nearest MTR station?"]);
  });

  it("剝得走 markdown code fence", () => {
    expect(parseTranslation('```json\n{"english":"Thanks!","alternatives":[]}\n```').english).toBe(
      "Thanks!"
    );
  });

  it("略去與主譯文重複、空白或非字串的其他講法,最多兩個", () => {
    const r = parseTranslation(
      JSON.stringify({
        english: "Thanks a lot.",
        alternatives: ["thanks a lot.", "", 3, "Thank you so much.", "Thank you so much.", "Cheers.", "Ta."],
      })
    );
    expect(r.alternatives).toEqual(["Thank you so much.", "Cheers."]);
  });

  it("沒有 alternatives 欄位就回空陣列", () => {
    expect(parseTranslation('{"english":"OK."}').alternatives).toEqual([]);
  });

  it("模型答散文就整段當譯文", () => {
    expect(parseTranslation("Could you help me?")).toEqual({
      english: "Could you help me?",
      alternatives: [],
    });
  });

  // 截斷:不可把原始 JSON 顯示給用戶
  it("JSON 被截斷時仍拎得到完整的 english,不會顯示原始 JSON", () => {
    const r = parseTranslation('{"english": "I\'ll be there in ten minutes.", "alternatives": ["I\'ll be th');
    expect(r.english).toBe("I'll be there in ten minutes.");
    expect(r.alternatives).toEqual([]);
  });

  it("english 本身都斷了就回空字串(由 API 報錯),不顯示半句", () => {
    expect(parseTranslation('{"english": "I\'ll be th').english).toBe("");
  });
});

const entry = (chinese: string, at: number): TranslationEntry => ({
  id: chinese + at,
  chinese,
  english: "e",
  alternatives: [],
  at,
});

describe("addToHistory", () => {
  it("最新在前", () => {
    const h = addToHistory([entry("舊", 1)], entry("新", 2));
    expect(h.map((e) => e.chinese)).toEqual(["新", "舊"]);
  });

  it("同一句中文只留最新一次", () => {
    const h = addToHistory([entry("唔該", 1), entry("早晨", 2)], entry("唔該 ", 3));
    expect(h.map((e) => e.at)).toEqual([3, 2]);
  });

  it("超出上限丟最舊的", () => {
    let h: TranslationEntry[] = [];
    for (let i = 0; i < MAX_HISTORY + 5; i++) h = addToHistory(h, entry(`句${i}`, i));
    expect(h).toHaveLength(MAX_HISTORY);
    expect(h[0].at).toBe(MAX_HISTORY + 4);
  });
});

describe("sanitizeHistory", () => {
  it("丟棄壞項目,補回缺少的 alternatives", () => {
    const h = sanitizeHistory([
      { id: "a", chinese: "你好", english: "Hi", at: 1 },
      { id: "b", chinese: "x" },
      null,
      "junk",
    ]);
    expect(h).toHaveLength(1);
    expect(h[0].alternatives).toEqual([]);
  });

  it("不是陣列就回空", () => {
    expect(sanitizeHistory({})).toEqual([]);
  });
});
