import { describe, it, expect } from "vitest";
import { itemsToText, toTextFile } from "@/lib/textExport";

describe("itemsToText", () => {
  it("一項一段,次序照傳入的次序", () => {
    expect(
      itemsToText([
        { text: "We are the class teachers of 3P." },
        { text: "I will handle parent communication." },
      ])
    ).toBe("We are the class teachers of 3P.\n\nI will handle parent communication.\n");
  });

  it("只輸出句子本身:沒有類別、日期、解釋", () => {
    const t = itemsToText([{ text: "Each subject teacher marks their own homework." }]);
    expect(t).toBe("Each subject teacher marks their own homework.\n");
    expect(t).not.toContain("Correction");
    expect(t).not.toContain("2026");
  });

  // 用戶自己揀,所以 AI 回應、生字、更正一律照出 —— 程式不再代為判斷
  it("揀咗甚麼就出甚麼,不會自行過濾任何類別", () => {
    const t = itemsToText([
      { text: "That sounds like a well-balanced plan." },
      { text: "radiography" },
    ]);
    expect(t).toContain("That sounds like a well-balanced plan.");
    expect(t).toContain("radiography");
  });

  it("前後空白會修掉", () => {
    expect(itemsToText([{ text: "  padded.  " }])).toBe("padded.\n");
  });

  it("空白項目不會變成空行", () => {
    expect(itemsToText([{ text: "   " }, { text: "Kept." }])).toBe("Kept.\n");
  });

  it("同一句收藏過兩次不會重複輸出", () => {
    expect(
      itemsToText([{ text: "Same one." }, { text: "same ONE." }, { text: "Other." }])
    ).toBe("Same one.\n\nOther.\n");
  });

  it("完全沒有項目就回空字串(頁面會提示先揀選)", () => {
    expect(itemsToText([])).toBe("");
    expect(itemsToText([{ text: "" }])).toBe("");
  });

  it("結尾只有一個換行", () => {
    expect(itemsToText([{ text: "One." }])).toBe("One.\n");
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

  it("開頭加 UTF-8 BOM,否則中文會變亂碼", () => {
    expect(toTextFile("糾正").charCodeAt(0)).toBe(0xfeff);
    expect(toTextFile("糾正").slice(1)).toBe("糾正");
  });
});
