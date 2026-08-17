import { describe, it, expect } from "vitest";
import {
  correctedText,
  convoToText,
  convosToText,
  toTextFile,
} from "@/lib/textExport";
import type { Convo } from "@/lib/convoStore";

const convo = (items: Convo["items"], updatedAt = 1_700_000_000_000): Convo =>
  ({
    id: "c" + updatedAt,
    title: "Chat",
    scenario: "free",
    createdAt: updatedAt,
    updatedAt,
    items,
  }) as Convo;

describe("correctedText — 只取已改好的版本", () => {
  it("有 rewrite 就用 rewrite", () => {
    expect(
      correctedText({
        kind: "user",
        content: "I go to cinema yesterday.",
        corrections: [
          { original: "I go", corrected: "I went", explanation: "過去式。" },
        ],
        rewrite: "I went to the cinema yesterday.",
      })
    ).toBe("I went to the cinema yesterday.");
  });

  it("本來就沒問題(沒有糾正)就用原句", () => {
    expect(
      correctedText({ kind: "user", content: "I love running.", corrections: [] })
    ).toBe("I love running.");
  });

  // 關鍵:有錯但沒有可信的正確版本時,絕不可以把錯句輸出
  it("有糾正但沒有 rewrite → 略過,不輸出錯句", () => {
    expect(
      correctedText({
        kind: "user",
        content: "My elder son, which is a form 6 student",
        corrections: [
          {
            original: "which",
            corrected: "who",
            explanation: "指人用 who。",
          },
        ],
        rewrite: "",
      })
    ).toBeNull();
  });

  it("AI 的回覆一律不要", () => {
    expect(
      correctedText({ kind: "assistant", content: "That sounds fun!" })
    ).toBeNull();
  });

  it("空白內容不會輸出空行", () => {
    expect(correctedText({ kind: "user", content: "   ", corrections: [] })).toBeNull();
  });
});

describe("convoToText", () => {
  const c = convo([
    {
      kind: "user",
      content: "I go to cinema yesterday.",
      corrections: [{ original: "I go", corrected: "I went", explanation: "過去式。" }],
      rewrite: "I went to the cinema yesterday.",
    },
    { kind: "assistant", content: "That sounds fun! What did you watch?" },
    { kind: "user", content: "We watched a documentary.", corrections: [] },
  ]);

  it("只有已改好的句子,一句一段", () => {
    expect(convoToText(c)).toBe(
      "I went to the cinema yesterday.\n\nWe watched a documentary."
    );
  });

  it("沒有標題、日期、情境名", () => {
    const t = convoToText(c);
    expect(t).not.toContain("Chat");
    expect(t).not.toContain("Free chat");
    expect(t).not.toContain("2023");
    expect(t).not.toContain("=");
  });

  it("沒有 [You] / [AI] 標記,沒有 AI 回覆", () => {
    const t = convoToText(c);
    expect(t).not.toContain("[You]");
    expect(t).not.toContain("[AI]");
    expect(t).not.toContain("That sounds fun");
  });

  it("沒有原本寫錯的版本,沒有糾正解釋", () => {
    const t = convoToText(c);
    expect(t).not.toContain("I go to cinema yesterday.");
    expect(t).not.toContain("過去式");
    expect(t).not.toContain("Corrections");
  });

  it("空白對話回空字串", () => {
    expect(convoToText(convo([]))).toBe("");
  });
});

describe("convosToText", () => {
  it("多個對話由舊到新串起來", () => {
    const t = convosToText([
      convo([{ kind: "user", content: "Newer sentence.", corrections: [] }], 9000),
      convo([{ kind: "user", content: "Older sentence.", corrections: [] }], 1000),
    ]);
    expect(t.indexOf("Older sentence.")).toBeLessThan(t.indexOf("Newer sentence."));
  });

  it("完全沒有可輸出的句子就回空字串", () => {
    expect(convosToText([])).toBe("");
    expect(convosToText([convo([{ kind: "assistant", content: "hi" }])])).toBe("");
  });

  it("結尾有一個換行", () => {
    const t = convosToText([convo([{ kind: "user", content: "One.", corrections: [] }])]);
    expect(t).toBe("One.\n");
  });

  it("跳過沒有內容的對話,不留下空白段落", () => {
    const t = convosToText([
      convo([{ kind: "user", content: "Kept.", corrections: [] }], 2000),
      convo([], 1000),
    ]);
    expect(t).toBe("Kept.\n");
  });
});

describe("toTextFile", () => {
  const BOM = "﻿";

  it("轉成 CRLF,Windows 記事本才不會擠成一行", () => {
    expect(toTextFile("a\nb\nc")).toBe(BOM + "a\r\nb\r\nc");
  });

  it("已經是 CRLF 就不會變成 \\r\\r\\n", () => {
    expect(toTextFile("a\r\nb")).toBe(BOM + "a\r\nb");
  });

  it("開頭加 UTF-8 BOM", () => {
    expect(toTextFile("x").charCodeAt(0)).toBe(0xfeff);
  });
});
