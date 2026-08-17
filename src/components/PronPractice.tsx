"use client";

import { useState } from "react";
import { useRecorder } from "@/hooks/useRecorder";
import { scorePronunciation, type PronResult } from "@/lib/pron";

/** 跟讀評分:按 🎤 朗讀目標句 → 語音轉文字 → 逐字比對評分。 */
export default function PronPractice({ target }: { target: string }) {
  const [result, setResult] = useState<PronResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { recording, transcribing, supported, start, stop } = useRecorder({
    onResult: (heard) => {
      setErr(null);
      setResult(scorePronunciation(target, heard));
    },
    onError: (m) => setErr(m),
  });

  if (!supported) return null;

  return (
    <div className="pron">
      <button
        type="button"
        className={`pron-btn ${recording ? "recording" : ""}`}
        onClick={recording ? stop : start}
        disabled={transcribing}
        title="Read this aloud and get a pronunciation score"
      >
        {transcribing ? "Scoring…" : recording ? "⏹ Tap when done" : "🎙 Read aloud"}
      </button>

      {err && <span className="pron-err">⚠️ {err}</span>}

      {result && (
        <div className="pron-result">
          <span
            className={`pron-score ${
              result.score >= 80 ? "good" : result.score >= 50 ? "mid" : "bad"
            }`}
          >
            {result.score}%
          </span>
          <span className="pron-words">
            {result.words.map((w, i) => (
              <span key={i} className={w.ok ? "w-ok" : "w-miss"}>
                {w.word}{" "}
              </span>
            ))}
          </span>
          <span className="pron-heard">Heard: “{result.heard}”</span>
        </div>
      )}
    </div>
  );
}
