"use client";

import { useEffect, useState } from "react";
import SpeakerButton from "./SpeakerButton";
import { addVocab, useSaved } from "@/lib/savedStore";
import { addUsage } from "@/lib/usage";

export type LookupState = {
  word: string;
  sentence: string;
  loading: boolean;
  meaning?: string;
  example?: string;
  error?: string;
};

/** 將 AI 英文回覆變成「逐字可點按」— 點一下即查生字。 */
export function TappableText({
  text,
  onWord,
}: {
  text: string;
  onWord: (word: string, sentence: string) => void;
}) {
  const parts = text.split(/([A-Za-z][A-Za-z'’-]*)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^[A-Za-z]/.test(p) && p.length > 2 ? (
          <span key={i} className="wtap" onClick={() => onWord(p, text)}>
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

/** 查詢後由底部彈出的生字卡。 */
export default function VocabSheet({
  lookup,
  onClose,
}: {
  lookup: LookupState | null;
  onClose: () => void;
}) {
  const { items } = useSaved();
  const [added, setAdded] = useState(false);

  // 按 Esc 關閉(鍵盤用戶及手機外接鍵盤同樣適用)。
  useEffect(() => {
    if (!lookup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lookup, onClose]);

  if (!lookup) return null;

  const already =
    added || items.some((i) => i.kind === "vocab" && i.text === lookup.word);

  return (
    <div className="sheet-mask" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Word: ${lookup.word}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-word">
          {lookup.word}
          <SpeakerButton text={lookup.word} title="Read the word aloud" />
        </div>
        {lookup.loading && <div className="sheet-loading">Looking up…</div>}
        {lookup.error && <div className="login-error">⚠️ {lookup.error}</div>}
        {lookup.meaning && <div className="sheet-meaning">{lookup.meaning}</div>}
        {lookup.example && (
          <div className="sheet-example">
            {lookup.example}
            <SpeakerButton text={lookup.example} title="Read the example aloud" />
          </div>
        )}
        <div className="sheet-actions">
          <button
            className="primary-btn"
            disabled={lookup.loading || !lookup.meaning || already}
            onClick={() => {
              addVocab(lookup.word, lookup.meaning ?? "", lookup.example ?? "");
              setAdded(true);
            }}
          >
            {already ? "✓ In vocab list" : "＋ Add to vocab"}
          </button>
          <button className="ghost-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** 呼叫 /api/vocab 查一個字。 */
export async function lookupWord(word: string, sentence: string) {
  const res = await fetch("/api/vocab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word, sentence }),
  });
  const data = (await res.json()) as {
    meaning?: string;
    example?: string;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "Lookup failed");
  addUsage({ tokens: 120 }); // 粗略估算一次查字的成本
  return { meaning: data.meaning ?? "", example: data.example ?? "" };
}
