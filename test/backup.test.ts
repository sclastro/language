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

/** 全新一部機:清空儲存 + 重置模組狀態。 */
async function freshDevice() {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  vi.resetModules();
  return {
    convo: await import("@/lib/convoStore"),
    saved: await import("@/lib/savedStore"),
    backup: await import("@/lib/backup"),
  };
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
});

describe("mergeConvos(對話合併)", () => {
  it("同一個對話取 updatedAt 較新那份", async () => {
    const { convo } = await freshDevice();
    const older = { id: "c1", title: "A", scenario: "free", items: [{ kind: "user", content: "hi" }], createdAt: 1, updatedAt: 100 };
    const newer = { id: "c1", title: "A", scenario: "free", items: [{ kind: "user", content: "hi" }, { kind: "assistant", content: "hello" }], createdAt: 1, updatedAt: 200 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [m] = convo.mergeConvos([older as any], [newer as any]);
    expect(m.updatedAt).toBe(200);
    expect(m.items).toHaveLength(2);
  });

  it("兩邊不同的對話會合併埋一齊", async () => {
    const { convo } = await freshDevice();
    const a = { id: "c1", title: "A", scenario: "free", items: [], createdAt: 1, updatedAt: 100 };
    const b = { id: "c2", title: "B", scenario: "free", items: [], createdAt: 1, updatedAt: 50 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = convo.mergeConvos([a as any], [b as any]);
    expect(m.map((c) => c.id)).toEqual(["c1", "c2"]); // 依 updatedAt 由新到舊
  });

  // 迴歸:收藏曾經有過同一個 bug —— 刪咗會由雲端翻生
  it("刪除記錄要令對話唔會由雲端翻生", async () => {
    const { convo } = await freshDevice();
    const cloud = { id: "gone", title: "X", scenario: "free", items: [], createdAt: 1, updatedAt: 1000 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(convo.mergeConvos([], [cloud as any], { gone: 2000 })).toHaveLength(0);
  });

  it("刪除之後再更新過(較新)就要保留", async () => {
    const { convo } = await freshDevice();
    const cloud = { id: "again", title: "X", scenario: "free", items: [], createdAt: 1, updatedAt: 3000 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(convo.mergeConvos([], [cloud as any], { again: 2000 })).toHaveLength(1);
  });

  it("壞資料會被略過,唔會爆", async () => {
    const { convo } = await freshDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(convo.mergeConvos([null, { id: 5 }, "x"] as any, [])).toHaveLength(0);
  });
});

describe("getSyncableConvos", () => {
  it("空白對話唔會同步(否則每部機都製造一個 New chat)", async () => {
    const { convo } = await freshDevice();
    convo.newConvo("free"); // 空白
    expect(convo.getSyncableConvos()).toHaveLength(0);

    convo.updateActiveItems(() => [{ kind: "user", content: "I go to cinema." }]);
    expect(convo.getSyncableConvos()).toHaveLength(1);
  });

  it("有數量上限,取最近更新那些", async () => {
    const { convo } = await freshDevice();
    for (let i = 0; i < 5; i++) {
      convo.newConvo("free");
      convo.updateActiveItems(() => [{ kind: "user", content: "msg " + i }]);
    }
    expect(convo.getSyncableConvos(3)).toHaveLength(3);
  });

  // 迴歸:另一部機刪咗對話,雲端會回「空 convos + 一條刪除記錄」。
  // 如果 incoming 為空就早退,本機副本永遠唔會清走,對話會翻生。
  it("收到空 incoming 但有刪除記錄時,本機副本要被清走", async () => {
    const { convo } = await freshDevice();
    const id = convo.newConvo("free");
    convo.updateActiveItems(() => [{ kind: "user", content: "delete me elsewhere" }]);
    expect(convo.getSyncableConvos()).toHaveLength(1);

    // 模擬由雲端學到「另一部機刪咗佢」
    convo.mergeConvoTombstones({ [id]: Date.now() + 1000 });
    const changed = convo.mergeInConvos([]); // 雲端已經冇呢個對話
    expect(changed).toBe(1);
    expect(convo.getSyncableConvos().some((c) => c.id === id)).toBe(false);
  });

  it("deleteConvo 會留低刪除記錄", async () => {
    const { convo } = await freshDevice();
    const id = convo.newConvo("free");
    convo.updateActiveItems(() => [{ kind: "user", content: "bye" }]);
    convo.deleteConvo(id);
    expect(convo.getConvoTombstones()[id]).toBeGreaterThan(0);
  });
});

describe("備份 round-trip", () => {
  it("備份要包含對話,還原後對話同訊息都要在", async () => {
    const a = await freshDevice();
    a.convo.newConvo("interview");
    a.convo.updateActiveItems(() => [
      { kind: "user", content: "I go to cinema yesterday.", rewrite: "I went to the cinema yesterday." },
      { kind: "assistant", content: "That sounds fun!" },
    ]);
    a.saved.addVocab("radiography", "(noun) X-ray imaging", "She studied radiography.");
    const json = a.backup.buildBackupJson();

    const parsed = JSON.parse(json);
    expect(parsed.convos).toHaveLength(1);
    expect(parsed.items).toHaveLength(1);

    // 換一部新機還原
    const b = await freshDevice();
    const r = b.backup.restoreBackup(JSON.parse(json));
    expect(r.convos).toBe(1);
    expect(r.items).toBe(1);

    const convos = b.convo.getSyncableConvos();
    expect(convos).toHaveLength(1);
    expect(convos[0].scenario).toBe("interview");
    expect(convos[0].items).toHaveLength(2);
    expect(convos[0].items[0].content).toBe("I go to cinema yesterday.");
    // 生字解釋唔可以掉失(舊 bug)
    expect(b.saved.getAllSaved()[0].meaning).toBe("(noun) X-ray imaging");
  });

  it("讀得返舊備份(v2 冇 convos 欄位)", async () => {
    const { backup, saved, convo } = await freshDevice();
    const r = backup.restoreBackup({
      version: 2,
      exportedAt: 1,
      items: [{ text: "hello", kind: "reply", savedAt: 1 }],
      tombstones: {},
    });
    expect(r).toEqual({ items: 1, convos: 0 });
    expect(saved.getAllSaved()).toHaveLength(1);
    expect(convo.getSyncableConvos()).toHaveLength(0);
  });

  it("讀得返最舊嘅備份(v1 純陣列)", async () => {
    const { backup, saved } = await freshDevice();
    const r = backup.restoreBackup([{ text: "hi", kind: "reply", savedAt: 1 }]);
    expect(r).toEqual({ items: 1, convos: 0 });
    expect(saved.getAllSaved()).toHaveLength(1);
  });

  it("重複還原同一份備份唔會製造重複", async () => {
    const { backup, convo } = await freshDevice();
    const payload = {
      version: 3,
      exportedAt: 1,
      items: [],
      tombstones: {},
      convos: [{ id: "c1", title: "A", scenario: "free", items: [{ kind: "user", content: "hi" }], createdAt: 1, updatedAt: 100 }],
      convoTombstones: {},
    };
    expect(backup.restoreBackup(payload).convos).toBe(1);
    expect(backup.restoreBackup(payload).convos).toBe(0); // 第二次冇嘢更新
    expect(convo.getSyncableConvos()).toHaveLength(1);
  });

  it("本機刪咗嘅對話,唔會因為還原舊備份而翻生", async () => {
    const { backup, convo } = await freshDevice();
    const payload = {
      version: 3, exportedAt: 1, items: [], tombstones: {},
      convos: [{ id: "c1", title: "A", scenario: "free", items: [{ kind: "user", content: "hi" }], createdAt: 1, updatedAt: 100 }],
      convoTombstones: {},
    };
    backup.restoreBackup(payload);
    convo.deleteConvo("c1");
    expect(backup.restoreBackup(payload).convos).toBe(0);
    expect(convo.getSyncableConvos().some((c) => c.id === "c1")).toBe(false);
  });
});

describe("describeRestore", () => {
  it("講返實際還原咗幾多", async () => {
    const { backup } = await freshDevice();
    expect(backup.describeRestore({ items: 3, convos: 2 })).toBe(
      "Imported 3 saved items and 2 conversations"
    );
    expect(backup.describeRestore({ items: 1, convos: 0 })).toBe("Imported 1 saved item");
    expect(backup.describeRestore({ items: 0, convos: 0 })).toMatch(/Nothing new/);
  });
});
