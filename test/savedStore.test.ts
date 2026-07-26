import { describe, it, expect, beforeEach, vi } from "vitest";
import { mergeSaved, type SavedItem } from "@/lib/savedStore";

// 拎一個「乾淨」嘅 store:重置模組狀態,令 module-level 嘅 items/tombstones 由零開始。
async function freshStore() {
  vi.resetModules();
  return await import("@/lib/savedStore");
}

// 簡單 localStorage 假實作(Node 冇)
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
});

const item = (over: Partial<SavedItem> = {}): SavedItem => ({
  id: "x",
  text: "hello",
  kind: "reply",
  savedAt: 1000,
  ...over,
});

describe("importSavedItems(備份還原)", () => {
  // 迴歸:以前只帶 id/text/kind/savedAt,生字解釋同 SRS 進度會靜靜咁冇咗
  it("要保住 srs 複習進度同生字嘅 meaning/example", async () => {
    const s = await freshStore();
    const added = s.importSavedItems([
      {
        text: "radiography",
        kind: "vocab",
        savedAt: 100,
        meaning: "(名詞) 放射學",
        example: "She studied radiography.",
      },
      {
        text: "I went to the cinema.",
        kind: "rewrite",
        savedAt: 200,
        srs: { due: 9999, reps: 4, interval: 14 },
      },
    ]);
    expect(added).toBe(2);

    const all = s.getAllSaved();
    const vocab = all.find((i) => i.text === "radiography")!;
    expect(vocab.kind).toBe("vocab"); // 以前會變咗 "reply"
    expect(vocab.meaning).toBe("(名詞) 放射學");
    expect(vocab.example).toBe("She studied radiography.");

    const sentence = all.find((i) => i.text === "I went to the cinema.")!;
    expect(sentence.srs).toEqual({ due: 9999, reps: 4, interval: 14 });
  });

  it("同類別重複唔會再入,唔同類別可以並存", async () => {
    const s = await freshStore();
    s.importSavedItems([{ text: "run", kind: "vocab", savedAt: 1 }]);
    expect(s.importSavedItems([{ text: "run", kind: "vocab", savedAt: 2 }])).toBe(0);
    expect(s.importSavedItems([{ text: "run", kind: "correction", savedAt: 3 }])).toBe(1);
    expect(s.getAllSaved()).toHaveLength(2);
  });

  it("匯出再匯入應該一模一樣(round-trip)", async () => {
    const a = await freshStore();
    a.addVocab("radiography", "(名詞) 放射學", "She studied radiography.");
    a.addSaved("I went to the cinema.", "rewrite");
    a.reviewItem(a.getAllSaved().find((i) => i.kind === "rewrite")!.id, true);
    const json = a.exportSavedJson();

    // 新機:清空再還原
    (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
    const b = await freshStore();
    b.importSavedItems(JSON.parse(json).items);

    const restored = b.getAllSaved();
    expect(restored).toHaveLength(2);
    const vocab = restored.find((i) => i.kind === "vocab")!;
    expect(vocab.meaning).toBe("(名詞) 放射學");
    const rewrite = restored.find((i) => i.kind === "rewrite")!;
    expect(rewrite.srs?.reps).toBe(1); // 複習進度跟住過去
  });
});

describe("mergeSaved(雲端同步合併)", () => {
  it("兩邊唔同嘅項目會合埋", () => {
    const merged = mergeSaved(
      [item({ text: "a", savedAt: 1 })],
      [item({ text: "b", savedAt: 2 })]
    );
    expect(merged.map((i) => i.text).sort()).toEqual(["a", "b"]);
  });

  it("同一項:保留複習進度較深嗰個,但補齊另一邊嘅 meaning", () => {
    const local = item({ text: "w", kind: "vocab", savedAt: 5, meaning: "解釋" });
    const cloud = item({
      text: "w",
      kind: "vocab",
      savedAt: 3,
      srs: { due: 1, reps: 3, interval: 7 },
    });
    const [m] = mergeSaved([local], [cloud]);
    expect(m.srs?.reps).toBe(3); // 取進度深嗰個
    expect(m.meaning).toBe("解釋"); // 但唔會掉失解釋
  });

  // 迴歸:以前冇 tombstone,本機刪咗嘅嘢會由雲端拉返落嚟
  it("刪除記錄要令項目唔會由雲端翻生", () => {
    const cloud = [item({ text: "deleted-me", kind: "reply", savedAt: 1000 })];
    const tombs = { "reply deleted-me": 2000 }; // 喺 savedAt 之後刪
    expect(mergeSaved([], cloud, tombs)).toHaveLength(0);
  });

  it("但刪完之後再收藏返(較新),就要保留", () => {
    const cloud = [item({ text: "again", kind: "reply", savedAt: 3000 })];
    const tombs = { "reply again": 2000 }; // 刪除時間早過重新收藏
    expect(mergeSaved([], cloud, tombs)).toHaveLength(1);
  });
});

describe("刪除 → 同步", () => {
  it("removeSaved 會留低刪除記錄", async () => {
    const s = await freshStore();
    s.addSaved("bye", "reply");
    const id = s.getAllSaved()[0].id;
    s.removeSaved(id);
    expect(s.getAllSaved()).toHaveLength(0);
    expect(s.getTombstones()["reply bye"]).toBeGreaterThan(0);
  });

  it("重新收藏同一句會清走刪除記錄", async () => {
    const s = await freshStore();
    s.addSaved("bye", "reply");
    s.removeSaved(s.getAllSaved()[0].id);
    s.addSaved("bye", "reply");
    expect(s.getTombstones()["reply bye"]).toBeUndefined();
    expect(s.getAllSaved()).toHaveLength(1);
  });
});
