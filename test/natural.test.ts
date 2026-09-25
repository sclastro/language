import { describe, it, expect } from "vitest";
import { parseTutorResponse, extractClosedJsonString } from "@/lib/tutorJson";
import { naturalVersion } from "@/lib/fullRewrite";
import { buildSystemPrompt } from "@/lib/prompt";
import type { Correction } from "@/lib/types";

// 用戶的要求:文法沒錯時,亦要幫忙把整段改寫成更通順、更地道的英文。
const ORIG = "I very like this movie. It makes me have a deep impression.";
const NAT = "I really love this movie. It left a deep impression on me.";

describe("natural — prompt", () => {
  const p = buildSystemPrompt("intermediate");

  it("JSON 形狀包含 natural 欄位", () => {
    expect(p).toContain('"natural": string');
  });

  it("要求整段改寫,並保留原意及所有句子", () => {
    expect(p).toContain("ENTIRE most recent message rewritten");
    expect(p).toContain("do not add new ideas or drop any sentence");
  });

  // rewrite 仍然只改錯;地道版本另外一欄,不可混在一起
  it("rewrite 依然不可套用 polish", () => {
    expect(p).toContain("Do NOT apply `polish` suggestions to it");
  });
});

describe("natural — 解析", () => {
  it("解析完整 JSON 中的 natural", () => {
    const r = parseTutorResponse(
      JSON.stringify({ reply: "Nice!", corrections: [], polish: [], rewrite: ORIG, natural: NAT })
    );
    expect(r.natural).toBe(NAT);
  });

  it("舊回覆沒有 natural 欄位就回空字串(不可以是 undefined)", () => {
    expect(parseTutorResponse('{"reply":"Hi","corrections":[],"rewrite":"Hi"}').natural).toBe("");
    expect(parseTutorResponse("Just chatting.").natural).toBe("");
  });

  // 半段示範答案比沒有更誤導:用戶會以為後半段可以刪去
  it("natural 被截斷時丟棄,不顯示半段", () => {
    const r = parseTutorResponse(
      '{"reply":"Nice!","corrections":[],"polish":[],"rewrite":"' + ORIG + '","natural":"I really love this mov'
    );
    expect(r.truncated).toBe(true);
    expect(r.rewrite).toBe(ORIG);
    expect(r.natural).toBe("");
  });

  it("截斷發生在 natural 之後(已閉合)就保留", () => {
    const r = parseTutorResponse('{"reply":"Nice!","natural":"' + NAT + '","extra":[{"a');
    expect(r.truncated).toBe(true);
    expect(r.natural).toBe(NAT);
  });

  it("extractClosedJsonString 處理跳脫引號", () => {
    expect(extractClosedJsonString('{"natural":"say \\"hi\\""}', "natural")).toBe('say "hi"');
    expect(extractClosedJsonString('{"natural":"say \\"hi', "natural")).toBe("");
    expect(extractClosedJsonString('{"reply":"x"}', "natural")).toBe("");
  });
});

describe("naturalVersion — 何時顯示", () => {
  const onePolish = 1;
  const fix: Correction[] = [{ original: "I very like", corrected: "I really like", explanation: "" }];

  it("文法無誤但有地道建議 → 顯示整段地道版本", () => {
    expect(naturalVersion(ORIG, [], onePolish, ORIG, NAT)).toBe(NAT);
  });

  it("有糾正時亦顯示(與完整正確版本不同)", () => {
    const fixed = "I really like this movie. It makes me have a deep impression.";
    expect(naturalVersion(ORIG, fix, 0, fixed, NAT)).toBe(NAT);
  });

  it("沒有糾正亦沒有建議 → 不顯示(卡片正寫着 sounds natural)", () => {
    expect(naturalVersion(ORIG, [], 0, ORIG, NAT)).toBe("");
  });

  it("與完整正確版本或原文實質相同(只差空白)→ 不顯示", () => {
    expect(naturalVersion(ORIG, [], onePolish, ORIG, "  " + ORIG.replace(". ", ".  "))).toBe("");
    const fixed = "I really like this movie.";
    expect(naturalVersion("I very like this movie.", fix, 0, fixed, fixed)).toBe("");
  });

  it("模型沒有給 / 舊訊息 → 不顯示", () => {
    expect(naturalVersion(ORIG, [], onePolish, ORIG, undefined)).toBe("");
    expect(naturalVersion(ORIG, [], onePolish, ORIG, "   ")).toBe("");
  });
});
