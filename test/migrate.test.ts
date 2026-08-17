import { describe, it, expect } from "vitest";
import { migrateConvos, type Convo } from "@/lib/convoStore";

const convo = (over: Partial<Convo> = {}): Convo =>
  ({
    id: "c1",
    title: "Chat",
    scenario: "free",
    createdAt: 1000,
    updatedAt: 1000,
    items: [],
    ...over,
  }) as Convo;

// 真實個案:輸出被 max_tokens 截斷,原始 JSON 被當成 AI 訊息存落 localStorage
const brokenJson =
  '{"reply": "Congratulations on your son getting into PolyU for Optometry! ' +
  'I understand your worry about the plantar fasciitis. Have you seen a doctor yet?", ' +
  '"corrections": [{"original": "My elder son, which is a form 6 student", ' +
  '"corrected": "My elder son, who is a Form 6 student", ' +
  '"explanation": "指人要用關係代名詞「who」,不可用「which」。"}, ' +
  '{"original": "in the mid of November", "corrected": "in mid-November", ' +
  '"explanation": "「mid-November」才是正確講法。"}], ' +
  '"rewrite": "My elder son, who is a Form 6 student, finally got into PolyU."}';

describe("migrateConvos — 修復存落 localStorage 的原始 JSON", () => {
  function broken() {
    return convo({
      items: [
        {
          kind: "user",
          content: "My elder son, which is a form 6 student, got into PolyU.",
          corrections: [],
          rewrite: "",
        },
        { kind: "assistant", content: brokenJson },
      ],
    });
  }

  it("AI 訊息唔再係原始 JSON", () => {
    const c = broken();
    expect(migrateConvos([c])).toBeGreaterThan(0);
    const ai = c.items[1];
    expect(ai.content.startsWith("Congratulations")).toBe(true);
    expect(ai.content).not.toContain('"corrections"');
    expect(ai.content).not.toContain('{"reply"');
  });

  it("當時漏掉的糾正會補回上一句用戶訊息", () => {
    const c = broken();
    migrateConvos([c]);
    const user = c.items[0];
    if (user.kind !== "user") throw new Error("expected user item");
    expect(user.corrections).toHaveLength(2);
    expect(user.corrections?.[0].corrected).toBe("My elder son, who is a Form 6 student");
    expect(user.corrections?.[0].explanation).toContain("who");
    expect(user.rewrite).toContain("who is a Form 6 student");
  });

  it("重複執行唔會再改(idempotent)", () => {
    const c = broken();
    migrateConvos([c]);
    const snapshot = JSON.stringify(c);
    expect(migrateConvos([c])).toBe(0);
    expect(JSON.stringify(c)).toBe(snapshot);
  });

  it("正常訊息一概不動", () => {
    const c = convo({
      items: [
        { kind: "user", content: "I love running.", corrections: [] },
        { kind: "assistant", content: "That's great! How often do you run?" },
      ],
    });
    expect(migrateConvos([c])).toBe(0);
  });

  it("用戶訊息本來已有糾正,就唔會被蓋過", () => {
    const mine = [{ original: "a", corrected: "b", explanation: "keep me" }];
    const c = convo({
      items: [
        { kind: "user", content: "x", corrections: mine, rewrite: "b" },
        { kind: "assistant", content: brokenJson },
      ],
    });
    migrateConvos([c]);
    const user = c.items[0];
    if (user.kind !== "user") throw new Error("expected user item");
    expect(user.corrections?.[0].explanation).toBe("keep me");
    expect(user.rewrite).toBe("b");
  });

  it("救唔到 reply 就原封不動,唔會變成空白訊息", () => {
    const c = convo({
      items: [{ kind: "assistant", content: '{"corrections": [' }],
    });
    migrateConvos([c]);
    expect(c.items[0].content).toBe('{"corrections": [');
  });

  it("內容只是普通提到大括號,唔會被誤當 JSON", () => {
    const c = convo({
      items: [{ kind: "assistant", content: "Use {} to denote an empty set." }],
    });
    expect(migrateConvos([c])).toBe(0);
  });
});

describe("migrateConvos — 舊中文標題", () => {
  it("有內容就用首句命名(截首 24 字)", () => {
    const first = "I have to work with a native speaker.";
    const c = convo({
      title: "新對話",
      items: [{ kind: "user", content: first, corrections: [] }],
    });
    migrateConvos([c]);
    expect(c.title).toBe(first.slice(0, 24));
    expect(c.title).not.toBe("新對話");
  });

  it("空白對話改為 New chat", () => {
    const c = convo({ title: "新對話", items: [] });
    migrateConvos([c]);
    expect(c.title).toBe("New chat");
  });

  it("用戶自己改過的標題唔會動", () => {
    const c = convo({ title: "My interview practice", items: [] });
    expect(migrateConvos([c])).toBe(0);
    expect(c.title).toBe("My interview practice");
  });
});

describe("migrateConvos — 穩健性", () => {
  it("items 唔係陣列都唔會爆", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => migrateConvos([{ id: "x", title: "t", items: null } as any])).not.toThrow();
  });

  it("空陣列回 0", () => {
    expect(migrateConvos([])).toBe(0);
  });
});
