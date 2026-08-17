import { describe, it, expect } from "vitest";
import {
  parseTutorResponse,
  extractPartialReply,
  extractJsonString,
} from "@/lib/tutorJson";

describe("parseTutorResponse — 正常情況", () => {
  it("解析完整 JSON", () => {
    const r = parseTutorResponse(
      JSON.stringify({
        reply: "That sounds fun! What did you watch?",
        corrections: [
          { original: "I go", corrected: "I went", explanation: "過去式。" },
        ],
        rewrite: "I went to the cinema yesterday.",
      })
    );
    expect(r.reply).toBe("That sounds fun! What did you watch?");
    expect(r.corrections).toHaveLength(1);
    expect(r.corrections[0].explanation).toBe("過去式。");
    expect(r.rewrite).toBe("I went to the cinema yesterday.");
    expect(r.truncated).toBeUndefined();
  });

  it("剝得走 markdown code fence", () => {
    const r = parseTutorResponse(
      '```json\n{"reply":"Hi","corrections":[],"rewrite":"Hi"}\n```'
    );
    expect(r.reply).toBe("Hi");
  });

  it("模型答散文(完全不是 JSON)就整段當 reply", () => {
    const r = parseTutorResponse("Sure! Tell me more about your trip.");
    expect(r.reply).toBe("Sure! Tell me more about your trip.");
    expect(r.corrections).toEqual([]);
  });

  it("略過缺欄位的糾正", () => {
    const r = parseTutorResponse(
      '{"reply":"ok","corrections":[{"original":"a"},{"original":"b","corrected":"c"}],"rewrite":""}'
    );
    expect(r.corrections).toHaveLength(1);
    expect(r.corrections[0].corrected).toBe("c");
    expect(r.corrections[0].explanation).toBe("");
  });
});

describe("parseTutorResponse — 被 max_tokens 截斷", () => {
  // 迴歸:真實個案。輸出去到 corrections 中途就斷,舊版把整段原始 JSON
  // 倒去畫面上,而且糾正變空陣列(反而顯示「寫得很自然」)。
  const truncated =
    '{"reply": "Congratulations on your son getting into PolyU for Optometry, ' +
    'and Tokyo for eleven days sounds like a wonderful family trip! I understand ' +
    'your worry about the plantar fasciitis. Have you seen a doctor about your leg yet?", ' +
    '"corrections": [{"original": "My elder son, which is a form 6 student", ' +
    '"corrected": "My elder son, who is a Form 6 student", ' +
    '"explanation": "指人要用關係代名詞「who」,不可用「which」。"}, ' +
    '{"original": "in the mid of November", "corrected": "in mid-November", ' +
    '"explanation": "「mid-November」是正確講法。"}, ' +
    '{"original": "My right leg still hurt", "corrected": "My right leg still hurt';

  it("絕對不可以把原始 JSON 顯示給用戶", () => {
    const r = parseTutorResponse(truncated);
    expect(r.reply).not.toContain('"corrections"');
    expect(r.reply).not.toContain('{"reply"');
    expect(r.reply.startsWith("Congratulations")).toBe(true);
  });

  it("搶救到完整的糾正,丟棄斷尾那條", () => {
    const r = parseTutorResponse(truncated);
    expect(r.corrections).toHaveLength(2); // 第三條斷了
    expect(r.corrections[0].corrected).toBe("My elder son, who is a Form 6 student");
    expect(r.corrections[0].explanation).toContain("who");
    expect(r.corrections[1].corrected).toBe("in mid-November");
  });

  it("標記 truncated,好讓前端提示用戶", () => {
    expect(parseTutorResponse(truncated).truncated).toBe(true);
  });

  it("reply 中途就斷都仍然拎得到已完成部分", () => {
    const r = parseTutorResponse('{"reply": "That sounds like a great pl');
    expect(r.reply).toBe("That sounds like a great pl");
    expect(r.corrections).toEqual([]);
    expect(r.truncated).toBe(true);
  });

  it("斷喺跳脫序列中間都唔會爆", () => {
    const r = parseTutorResponse('{"reply": "He said \\"hello\\" and then \\');
    expect(r.reply).toContain("hello");
    expect(r.truncated).toBe(true);
  });
});

describe("extractJsonString / extractPartialReply", () => {
  it("串流途中逐步拎到 reply", () => {
    expect(extractPartialReply('{"reply":"That')).toBe("That");
    expect(extractPartialReply('{"reply":"That sounds f')).toBe("That sounds f");
    expect(extractPartialReply('{"reply":"Done","corrections":[]}')).toBe("Done");
  });

  it("未見到 reply 欄位就回空字串", () => {
    expect(extractPartialReply('{"corr')).toBe("");
    expect(extractPartialReply("")).toBe("");
  });

  it("處理引號同換行的跳脫", () => {
    expect(extractJsonString('{"reply":"a \\"b\\" c"}', "reply")).toBe('a "b" c');
    expect(extractJsonString('{"reply":"line1\\nline2"}', "reply")).toBe("line1\nline2");
  });

  it("拎得到 rewrite 欄位", () => {
    expect(
      extractJsonString('{"reply":"x","rewrite":"I went there."}', "rewrite")
    ).toBe("I went there.");
  });
});
