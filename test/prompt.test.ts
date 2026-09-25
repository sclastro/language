import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "@/lib/prompt";

describe("buildSystemPrompt", () => {
  const p = buildSystemPrompt("intermediate");

  it("要求的 JSON 形狀包含五個欄位", () => {
    for (const field of ["reply", "corrections", "polish", "rewrite", "natural"]) {
      expect(p).toContain(`"${field}"`);
    }
  });

  // 這正是用戶提出的問題:文法啱就乜都唔講,等於淨係做文法檢查。
  it("明確指示文法正確時仍要給地道建議", () => {
    expect(p).toContain("do not stay silent just because the grammar is fine");
  });

  it("把「真正的錯」同「可以更地道」分開", () => {
    expect(p).toContain("ACTUAL ERRORS ONLY");
    expect(p).toContain("Anything genuinely wrong belongs in `corrections`");
  });

  // rewrite 是「你自己那句改正後的版本」,套用 polish 就會變成模型的口吻,
  // ★ 收藏到的亦不再是自己寫的句子。
  it("叫模型不要把 polish 套進 rewrite", () => {
    expect(p).toContain("Do NOT apply `polish` suggestions to it");
  });

  it("解釋一律用繁體中文書面語", () => {
    expect(p).toContain("TRADITIONAL CHINESE");
    expect(p).toContain("NOT Cantonese colloquial");
  });

  it("難度會反映喺 prompt 入面", () => {
    expect(buildSystemPrompt("beginner")).toContain("BEGINNER");
    expect(buildSystemPrompt("advanced")).toContain("ADVANCED");
  });
});
