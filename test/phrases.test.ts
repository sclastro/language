import { describe, it, expect } from "vitest";
import {
  buildPhrasesPrompt,
  parsePhraseSet,
  sanitizePhraseSets,
  recentForTopic,
  setSentences,
  addPhraseSet,
  MAX_SETS,
  type PhraseSet,
} from "@/lib/phrases";

const set = (over: Partial<PhraseSet> = {}): PhraseSet => ({
  id: "s1",
  topic: "Ordering food and drinks",
  level: "intermediate",
  format: "sentences",
  title: "At a café",
  items: [{ en: "Can I get a latte?", zh: "可以給我一杯拿鐵嗎?", note: "點餐常用,語氣隨和。" }],
  at: 1,
  ...over,
});

describe("buildPhrasesPrompt", () => {
  it("中文意思用繁體書面語,不用廣東話口語", () => {
    const p = buildPhrasesPrompt({ topic: "Banking", level: "beginner", format: "sentences" });
    expect(p).toContain("Traditional Chinese");
    expect(p).toContain("not Cantonese colloquial");
    expect(p).toContain("CEFR A2");
  });

  it("三種形式各有自己的輸出形狀", () => {
    const d = buildPhrasesPrompt({ topic: "x", level: "advanced", format: "dialogue" });
    expect(d).toContain('"speaker": string');
    const p = buildPhrasesPrompt({ topic: "x", level: "advanced", format: "patterns" });
    expect(p).toContain('"examples"');
  });

  // 「再來一批」不可以又是同樣的十句
  it("帶上已出過的句子,要求不要重複", () => {
    const p = buildPhrasesPrompt({
      topic: "x",
      level: "intermediate",
      format: "sentences",
      avoid: ["Can I get a latte?"],
    });
    expect(p).toContain("Do NOT repeat");
    expect(p).toContain("Can I get a latte?");
  });
});

describe("parsePhraseSet", () => {
  it("正常 JSON(連 markdown fence)", () => {
    const raw =
      '```json\n{"title":"At a café","items":[{"en":"Can I get a latte?","zh":"可以給我一杯拿鐵嗎?","note":""}]}\n```';
    const r = parsePhraseSet(raw, "sentences");
    expect(r.truncated).toBe(false);
    expect(r.title).toBe("At a café");
    // 空白 note 不保留
    expect(r.items).toEqual([{ en: "Can I get a latte?", zh: "可以給我一杯拿鐵嗎?" }]);
  });

  it("缺英文或中文的項目整項略去", () => {
    const raw = '{"title":"t","items":[{"en":"Hi"},{"en":"Hello","zh":"你好"}]}';
    expect(parsePhraseSet(raw, "sentences").items).toEqual([{ en: "Hello", zh: "你好" }]);
  });

  it("句式保留例句;對話保留說話人", () => {
    const pat = parsePhraseSet(
      '{"title":"t","items":[{"en":"Would you mind …?","zh":"你介意…嗎?","note":"n","examples":[{"en":"Would you mind waiting?","zh":"你介意等一下嗎?"},{"en":"bad"}]}]}',
      "patterns"
    );
    expect(pat.items[0].examples).toEqual([{ en: "Would you mind waiting?", zh: "你介意等一下嗎?" }]);
    const dia = parsePhraseSet('{"title":"t","items":[{"speaker":"Waiter","en":"Hi!","zh":"你好!"}]}', "dialogue");
    expect(dia.items[0].speaker).toBe("Waiter");
  });

  // 被 max_tokens 截斷:搶救前面完整的項目,半項不要
  it("截斷時搶救完整的項目並標示 truncated", () => {
    const raw =
      '{"title":"At a café","items":[{"en":"One {brace}","zh":"一"},{"en":"Two","zh":"二"},{"en":"Thr';
    const r = parsePhraseSet(raw, "sentences");
    expect(r.truncated).toBe(true);
    expect(r.title).toBe("At a café");
    expect(r.items.map((i) => i.en)).toEqual(["One {brace}", "Two"]);
  });
});

describe("phrase sets", () => {
  it("setSentences 包括句式的例句", () => {
    const s = set({
      format: "patterns",
      items: [{ en: "I was wondering if …", zh: "我想知道…", examples: [{ en: "I was wondering if you could help.", zh: "不知道你能否幫忙。" }] }],
    });
    expect(setSentences(s).map((x) => x.en)).toEqual([
      "I was wondering if …",
      "I was wondering if you could help.",
    ]);
  });

  it("recentForTopic 只取同一主題(不分大小寫)", () => {
    const list = [set(), set({ id: "s2", topic: "Banking", items: [{ en: "x", zh: "y" }] })];
    expect(recentForTopic(list, "ordering FOOD and drinks ")).toEqual(["Can I get a latte?"]);
  });

  it("addPhraseSet 最新在前並有上限", () => {
    let list: PhraseSet[] = [];
    for (let i = 0; i < MAX_SETS + 5; i++) list = addPhraseSet(list, set({ id: `s${i}`, at: i }));
    expect(list).toHaveLength(MAX_SETS);
    expect(list[0].id).toBe(`s${MAX_SETS + 4}`);
  });

  // 改動資料形狀必須驗欄位,不只數數量
  it("sanitizePhraseSets 保住所有欄位,壞資料略去", () => {
    const good = set({
      format: "patterns",
      items: [{ en: "a …", zh: "甲", note: "n", examples: [{ en: "a b", zh: "甲乙" }] }],
    });
    const out = sanitizePhraseSets([good, { id: "bad" }, { ...good, id: "x", format: "poem" }, null]);
    expect(out).toEqual([good]);
    expect(sanitizePhraseSets({})).toEqual([]);
  });

  it("舊資料缺 level 就補回 intermediate", () => {
    const { level: _l, ...noLevel } = set();
    void _l;
    expect(sanitizePhraseSets([noLevel])[0].level).toBe("intermediate");
  });
});
