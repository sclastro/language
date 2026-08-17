import { describe, it, expect } from "vitest";
import { convoToText, convosToText, toTextFile } from "@/lib/textExport";
import type { Convo } from "@/lib/convoStore";

const convo = (over: Partial<Convo> = {}): Convo =>
  ({
    id: "c1",
    title: "Cinema chat",
    scenario: "free",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    items: [],
    ...over,
  }) as Convo;

describe("convoToText", () => {
  const full = convo({
    title: "Cinema chat",
    scenario: "interview",
    items: [
      {
        kind: "user",
        content: "I go to cinema yesterday.",
        corrections: [
          {
            original: "I go to cinema yesterday",
            corrected: "I went to the cinema yesterday",
            explanation: "描述昨天的事要用過去式「went」。",
          },
        ],
        rewrite: "I went to the cinema yesterday.",
      },
      { kind: "assistant", content: "That sounds fun! What did you watch?" },
    ],
  });

  it("標題同情境放喺開頭", () => {
    const t = convoToText(full);
    expect(t).toContain("Cinema chat");
    expect(t).toContain("Job interview"); // scenario id 要轉成人看得懂的名稱
  });

  it("分清楚邊句係你講、邊句係 AI", () => {
    const t = convoToText(full);
    expect(t).toContain("[You]");
    expect(t).toContain("I go to cinema yesterday.");
    expect(t).toContain("[AI]");
    expect(t).toContain("That sounds fun! What did you watch?");
  });

  it("列出糾正同中文解釋(這才是最值得溫習的部分)", () => {
    const t = convoToText(full);
    expect(t).toContain('"I go to cinema yesterday" -> "I went to the cinema yesterday"');
    expect(t).toContain("描述昨天的事要用過去式「went」。");
  });

  it("有完整正確版本就列出", () => {
    expect(convoToText(full)).toContain("Full corrected version:");
  });

  it("rewrite 同原句一樣就不重複列出", () => {
    const t = convoToText(
      convo({
        items: [
          {
            kind: "user",
            content: "I went to the cinema.",
            corrections: [],
            rewrite: "I went to the cinema.",
          },
        ],
      })
    );
    expect(t).not.toContain("Full corrected version:");
    expect(t).not.toContain("Corrections:");
  });

  it("沒有糾正的訊息照樣輸出,不會假裝有糾正", () => {
    const t = convoToText(
      convo({ items: [{ kind: "user", content: "Hello there." }] })
    );
    expect(t).toContain("Hello there.");
    expect(t).not.toContain("Corrections:");
  });

  it("空白對話不會爆", () => {
    expect(() => convoToText(convo())).not.toThrow();
  });
});

describe("convosToText", () => {
  it("有標頭,並數出對話數目", () => {
    const t = convosToText([convo({ id: "a" }), convo({ id: "b", title: "Trip" })]);
    expect(t).toContain("English Tutor");
    expect(t).toContain("2 conversations");
  });

  it("最近更新的排最前", () => {
    const t = convosToText([
      convo({ id: "old", title: "OLDER", updatedAt: 1000 }),
      convo({ id: "new", title: "NEWER", updatedAt: 9000 }),
    ]);
    expect(t.indexOf("NEWER")).toBeLessThan(t.indexOf("OLDER"));
  });

  it("單數/複數用字正確", () => {
    expect(convosToText([convo()])).toContain("1 conversation");
  });

  it("完全沒有對話時給一句人話", () => {
    expect(convosToText([])).toBe("No conversations to export.\n");
  });
});

describe("toTextFile", () => {
  const BOM = "\uFEFF";

  it("轉成 CRLF,Windows 記事本才不會擠成一行", () => {
    expect(toTextFile("a\nb\nc")).toBe(BOM + "a\r\nb\r\nc");
  });

  it("已經是 CRLF 就不會變成 \\r\\r\\n", () => {
    expect(toTextFile("a\r\nb")).toBe(BOM + "a\r\nb");
  });

  // 沒有 BOM 的話,部分編輯器會把 UTF-8 猜成 ANSI,中文解釋會變亂碼
  it("開頭加 UTF-8 BOM", () => {
    expect(toTextFile("糾正解釋").charCodeAt(0)).toBe(0xfeff);
    expect(toTextFile("糾正解釋").slice(1)).toBe("糾正解釋");
  });
});
