"use client";

import { useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/clipboard";

type State = "idle" | "done" | "error";

/** 複製掣:一按即把整段文字放入剪貼簿,圖示短暫變成 ✓ 作確認。 */
export default function CopyButton({
  text,
  title = "Copy",
}: {
  text: string;
  title?: string;
}) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    const ok = await copyText(text);
    setState(ok ? "done" : "error");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1500);
  }

  const label = state === "done" ? "Copied" : state === "error" ? "Copy failed" : title;

  return (
    <button
      type="button"
      className={`copier ${state === "done" ? "on" : ""}`}
      onClick={copy}
      title={label}
      aria-label={label}
    >
      {state === "done" ? "✓" : state === "error" ? "⚠️" : "📋"}
    </button>
  );
}
