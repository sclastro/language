"use client";

import { useState } from "react";
import { useRecorder } from "@/hooks/useRecorder";
import { scorePronunciation, type PronResult } from "@/lib/pron";

/** 跟讀評分:撳 🎤 讀出目標句 → Whisper 轉錄 → 逐字比對俾分。 */
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
        title="跟讀呢句,評分你嘅發音"
      >
        {transcribing ? "評緊分…" : recording ? "⏹ 讀完㩒我" : "🎙 跟讀"}
      </button>

      {err && <span className="pron-err">⚠️ {err}</span>}

      {result && (
        <div className="pron-result">
          <span
            className={`pron-score ${
              result.score >= 80 ? "good" : result.score >= 50 ? "mid" : "bad"
            }`}
          >
            {result.score} 分
          </span>
          <span className="pron-words">
            {result.words.map((w, i) => (
              <span key={i} className={w.ok ? "w-ok" : "w-miss"}>
                {w.word}{" "}
              </span>
            ))}
          </span>
          <span className="pron-heard">你讀到:「{result.heard}」</span>
        </div>
      )}
    </div>
  );
}
