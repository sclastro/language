"use client";

import { useState } from "react";
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

/** 將 AI 英文回覆變成「逐個字可以撳」— 撳一下查生字。 */
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

/** 查完之後由底部彈出嘅生字卡。 */
export default function VocabSheet({
  lookup,
  onClose,
}: {
  lookup: LookupState | null;
  onClose: () => void;
}) {
  const { items } = useSaved();
  const [added, setAdded] = useState(false);
  if (!lookup) return null;

  const already =
    added || items.some((i) => i.kind === "vocab" && i.text === lookup.word);

  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-word">
          {lookup.word}
          <SpeakerButton text={lookup.word} title="讀出生字" />
        </div>
        {lookup.loading && <div className="sheet-loading">查緊字典…</div>}
        {lookup.error && <div className="login-error">⚠️ {lookup.error}</div>}
        {lookup.meaning && <div className="sheet-meaning">{lookup.meaning}</div>}
        {lookup.example && (
          <div className="sheet-example">
            {lookup.example}
            <SpeakerButton text={lookup.example} title="讀出例句" />
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
            {already ? "✓ 已喺生字簿" : "＋ 加入生字簿"}
          </button>
          <button className="ghost-btn" onClick={onClose}>
            閂
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
  if (!res.ok) throw new Error(data.error || "查詢失敗");
  addUsage({ tokens: 120 }); // 粗略估算一次查字嘅成本
  return { meaning: data.meaning ?? "", example: data.example ?? "" };
}
