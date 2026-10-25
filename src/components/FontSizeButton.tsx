"use client";

import { useEffect, useRef, useState } from "react";
import { FONT_SIZES, getFontSize, setFontSize, type FontSize } from "@/lib/fontScale";

/** 頂部的 Aa 掣:撳開後揀 S / M / L / XL,全 app 即時套用。 */
export default function FontSizeButton() {
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState<FontSize | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  // localStorage 只可在 effect 內讀取,否則 server 與 client 首次繪製不一致
  useEffect(() => {
    setSize(getFontSize());
  }, []);

  // 撳選單以外的地方就收起
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function pick(s: FontSize) {
    setFontSize(s);
    setSize(s);
    setOpen(false);
  }

  return (
    <span className="font-menu" ref={wrapRef}>
      <button
        type="button"
        className="ghost-btn"
        onClick={() => setOpen((o) => !o)}
        title="Text size"
        aria-label="Text size"
        aria-expanded={open}
      >
        Aa
      </button>
      {open && (
        <span className="font-pop" role="menu">
          {FONT_SIZES.map((f) => (
            <button
              key={f.id}
              type="button"
              role="menuitemradio"
              aria-checked={size === f.id}
              className={`font-opt font-opt-${f.id}${size === f.id ? " on" : ""}`}
              onClick={() => pick(f.id)}
            >
              {f.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
