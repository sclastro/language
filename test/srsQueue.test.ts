import { describe, it, expect, beforeEach, vi } from "vitest";

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

async function freshStore() {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  vi.resetModules();
  return await import("@/lib/savedStore");
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
});

const DAY = 86400000;

describe("每日新卡上限", () => {
  // 迴歸:沒有上限時,60 項收藏會有 51 項同時到期,一次溫不完,徽章變成噪音
  it("新卡最多出 DAILY_NEW_LIMIT 張", async () => {
    const s = await freshStore();
    for (let i = 0; i < 60; i++) s.addSaved(`Sentence ${i}.`, "reply");
    expect(s.getAllSaved()).toHaveLength(60);
    expect(s.dueItems()).toHaveLength(s.DAILY_NEW_LIMIT);
  });

  it("先出最早收藏的新卡", async () => {
    const s = await freshStore();
    // 用明確的 savedAt,唔好靠連續兩次 addSaved(同一毫秒會打成平手)
    s.replaceAll([
      { id: "n", text: "newer", kind: "reply", savedAt: 5000 },
      { id: "o", text: "oldest", kind: "reply", savedAt: 1000 },
    ]);
    expect(s.dueItems()[0].text).toBe("oldest");
  });

  it("複習過新卡就佔用今日配額", async () => {
    const s = await freshStore();
    for (let i = 0; i < 30; i++) s.addSaved(`S${i}`, "reply");
    expect(s.newCardsAllowance()).toBe(s.DAILY_NEW_LIMIT);

    const first = s.dueItems()[0];
    s.reviewItem(first.id, true);
    expect(s.newCardsAllowance()).toBe(s.DAILY_NEW_LIMIT - 1);
  });

  it("配額用完就唔再引入新卡", async () => {
    const s = await freshStore();
    for (let i = 0; i < 40; i++) s.addSaved(`S${i}`, "reply");
    // 把今日配額用光
    for (let n = 0; n < s.DAILY_NEW_LIMIT; n++) {
      const due = s.dueItems();
      const fresh = due.find((i) => !i.srs);
      if (!fresh) break;
      s.reviewItem(fresh.id, true);
    }
    expect(s.newCardsAllowance()).toBe(0);
    expect(s.dueItems().filter((i) => !i.srs)).toHaveLength(0);
  });

  it("第二日配額重置", async () => {
    const s = await freshStore();
    for (let i = 0; i < 30; i++) s.addSaved(`S${i}`, "reply");
    const now = Date.now();
    for (let n = 0; n < s.DAILY_NEW_LIMIT; n++) {
      const fresh = s.dueItems(now).find((i) => !i.srs);
      if (!fresh) break;
      s.reviewItem(fresh.id, true, now);
    }
    expect(s.newCardsAllowance(now)).toBe(0);
    expect(s.newCardsAllowance(now + DAY)).toBe(s.DAILY_NEW_LIMIT);
  });

  it("已排程的到期卡不受新卡配額限制", async () => {
    const s = await freshStore();
    // 30 張已排程並且到期的卡
    const now = Date.now();
    const scheduled = Array.from({ length: 30 }, (_, i) => ({
      id: "x" + i,
      text: "Scheduled " + i,
      kind: "reply" as const,
      savedAt: now - 10 * DAY,
      srs: { due: now - DAY, reps: 1, interval: 1 },
    }));
    s.replaceAll(scheduled);
    expect(s.dueItems(now)).toHaveLength(30);
  });

  it("未到期的已排程卡不會出現", async () => {
    const s = await freshStore();
    const now = Date.now();
    s.replaceAll([
      {
        id: "later",
        text: "Not yet",
        kind: "reply",
        savedAt: now,
        srs: { due: now + 3 * DAY, reps: 2, interval: 3 },
      },
    ]);
    expect(s.dueItems(now)).toHaveLength(0);
  });
});

describe("收藏原句與解釋(供複習出題)", () => {
  it("addSaved 會記下 original 同 explanation", async () => {
    const s = await freshStore();
    s.addSaved("We are the class teachers of 3P.", "correction", {
      original: "We are the class teacher of 3P.",
      explanation: "有兩位老師,所以用複數。",
    });
    const it = s.getAllSaved()[0];
    expect(it.original).toBe("We are the class teacher of 3P.");
    expect(it.explanation).toBe("有兩位老師,所以用複數。");
  });

  it("原句同正確版本一樣就唔存(出題無意義)", async () => {
    const s = await freshStore();
    s.addSaved("I love running.", "rewrite", { original: "I love running." });
    expect(s.getAllSaved()[0].original).toBeUndefined();
  });

  it("冇提供 original 亦正常運作(舊行為)", async () => {
    const s = await freshStore();
    s.addSaved("Some reply.", "reply");
    expect(s.getAllSaved()[0].original).toBeUndefined();
  });

  it("合併時唔會掉失 original / explanation", async () => {
    const s = await freshStore();
    const withExtra = {
      id: "a",
      text: "Corrected.",
      kind: "correction" as const,
      savedAt: 2000,
      original: "Wrong.",
      explanation: "解釋。",
    };
    const bare = {
      id: "a2",
      text: "Corrected.",
      kind: "correction" as const,
      savedAt: 3000,
    };
    const [m] = s.mergeSaved([bare], [withExtra]);
    expect(m.original).toBe("Wrong.");
    expect(m.explanation).toBe("解釋。");
  });

  it("匯入備份會保住 original / explanation", async () => {
    const s = await freshStore();
    s.importSavedItems([
      {
        text: "Corrected.",
        kind: "correction",
        savedAt: 1,
        original: "Wrong.",
        explanation: "解釋。",
      },
    ]);
    const it = s.getAllSaved()[0];
    expect(it.original).toBe("Wrong.");
    expect(it.explanation).toBe("解釋。");
  });
});
