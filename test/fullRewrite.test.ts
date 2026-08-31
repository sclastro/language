import { describe, it, expect } from "vitest";
import { fullCorrectedText, applyCorrections } from "@/lib/fullRewrite";
import { buildSystemPrompt } from "@/lib/prompt";
import type { Correction } from "@/lib/types";

// 你實際打的那種訊息:好幾句,只有一處錯
const LONG =
  "Good morning again, 3P! Some of you rely only on after school private tuition, " +
  "not on your own study. I want 3P to be a class that works well together, " +
  "looks out for each other, and feels proud of what we do.";

const FIXED =
  "Good morning again, 3P! Some of you rely only on after-school private tuition, " +
  "not on your own study. I want 3P to be a class that works well together, " +
  "looks out for each other, and feels proud of what we do.";

const oneFix: Correction[] = [
  {
    original: "rely only on after school private tuition",
    corrected: "rely only on after-school private tuition",
    explanation: "「after-school」作形容詞時要加連字號。",
  },
];

describe("fullCorrectedText", () => {
  it("模型有好好重寫整段時,直接用它那份", () => {
    expect(fullCorrectedText(LONG, oneFix, FIXED)).toBe(FIXED);
  });

  // 迴歸:打了一大段,模型只回它改動過的那一句,結果卡片同 ★ 收藏都只有一句
  it("模型只回一句時,自行合成返整段", () => {
    const fragment = "Some of you rely only on after-school private tuition.";
    const out = fullCorrectedText(LONG, oneFix, fragment);
    expect(out).toBe(FIXED);
    expect(out).toContain("Good morning again, 3P!"); // 開頭冇不見
    expect(out).toContain("feels proud of what we do."); // 結尾亦冇不見
    expect(out.length).toBeGreaterThan(fragment.length * 3);
  });

  it("模型完全冇回 rewrite,一樣合成得到", () => {
    expect(fullCorrectedText(LONG, oneFix, "")).toBe(FIXED);
  });

  it("多處糾正全部套用", () => {
    const orig = "I go to cinema yesterday and I eat popcorn.";
    const cs: Correction[] = [
      { original: "I go to cinema", corrected: "I went to the cinema", explanation: "" },
      { original: "I eat popcorn", corrected: "I ate popcorn", explanation: "" },
    ];
    expect(fullCorrectedText(orig, cs, "I went to the cinema.")).toBe(
      "I went to the cinema yesterday and I ate popcorn."
    );
  });

  it("糾正片段對唔上原文時,寧願用模型那份,唔會亂砌", () => {
    const cs: Correction[] = [
      { original: "something not in the message", corrected: "x", explanation: "" },
    ];
    const rw = "Short model answer.";
    expect(fullCorrectedText(LONG, cs, rw)).toBe(rw);
  });

  it("短訊息本身就短,唔會被當成殘缺", () => {
    const orig = "I go home.";
    const rw = "I went home.";
    expect(fullCorrectedText(orig, [], rw)).toBe(rw);
  });

  it("原句本來正確(rewrite 等於原句)照樣回原句", () => {
    expect(fullCorrectedText(LONG, [], LONG)).toBe(LONG);
  });

  it("冇原文可比較就只能信模型", () => {
    expect(fullCorrectedText(undefined, [], "Model answer.")).toBe("Model answer.");
    expect(fullCorrectedText("", oneFix, "Model answer.")).toBe("Model answer.");
  });
});

describe("applyCorrections", () => {
  it("逐處套用,保留其餘文字", () => {
    expect(applyCorrections(LONG, oneFix)).toBe(FIXED);
  });

  it("冇糾正就回 null(冇嘢要合成)", () => {
    expect(applyCorrections(LONG, [])).toBeNull();
  });

  it("片段搵唔到就回 null", () => {
    expect(
      applyCorrections(LONG, [{ original: "not here", corrected: "x", explanation: "" }])
    ).toBeNull();
  });

  it("糾正欄位空白就回 null", () => {
    expect(
      applyCorrections(LONG, [{ original: "", corrected: "x", explanation: "" }])
    ).toBeNull();
  });

  it("只替換第一次出現,唔會連其他位置一齊改", () => {
    const orig = "cat and cat";
    const out = applyCorrections(orig, [
      { original: "cat", corrected: "dog", explanation: "" },
    ]);
    expect(out).toBe("dog and cat");
  });
});

describe("prompt 對 rewrite 的指示", () => {
  // 這句指示一直有歧義:「one full ... sentence (or sentences)」令模型長訊息時
  // 只回改動過的一句。釘死關鍵字眼,免得日後又被改鬆。
  it("明確要求整段、每一句都要包含", () => {
    const p = buildSystemPrompt("intermediate");
    expect(p).toContain("ENTIRE most recent message");
    expect(p).toContain("EVERY sentence and paragraph");
    expect(p).toMatch(/NEVER only the sentences you corrected/);
  });

  it("唔會再出現舊嗰句有歧義的講法", () => {
    expect(buildSystemPrompt("intermediate")).not.toContain(
      "rewritten as one full, correct, natural English sentence"
    );
  });
});
