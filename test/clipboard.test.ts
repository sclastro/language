import { describe, it, expect, vi, afterEach } from "vitest";
import { copyText } from "@/lib/clipboard";

afterEach(() => vi.unstubAllGlobals());

describe("copyText", () => {
  it("用 navigator.clipboard 複製整段(去掉頭尾空白)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyText("  Hello there.\nSecond line.  ")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("Hello there.\nSecond line.");
  });

  it("空白文字不複製", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyText("   ")).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  // 舊版 iOS / PWA 可能拒絕 clipboard API,要退回 execCommand
  it("clipboard API 被拒時退回 execCommand", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    const ta = { value: "", style: {} as Record<string, string>, setAttribute: vi.fn(), select: vi.fn(), setSelectionRange: vi.fn() };
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal("document", {
      createElement: () => ta,
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand,
    });
    expect(await copyText("Fallback text")).toBe(true);
    expect(ta.value).toBe("Fallback text");
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("兩種方法都失敗就回 false,不拋錯", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", {
      createElement: () => {
        throw new Error("no DOM");
      },
    });
    expect(await copyText("x")).toBe(false);
  });
});
