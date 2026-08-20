"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SpeakerButton from "@/components/SpeakerButton";
import PronPractice from "@/components/PronPractice";
import { dueItems, reviewItem, type SavedItem } from "@/lib/savedStore";

/** 今日複習:SRS 到期的收藏,逐張複習,記得/忘記決定下次出現的時間。 */
export default function ReviewPage() {
  const [queue, setQueue] = useState<SavedItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setQueue(dueItems());
    setReady(true);
  }, []);

  const current = queue[idx];

  function grade(remembered: boolean) {
    if (!current) return;
    reviewItem(current.id, remembered);
    setDone((d) => d + 1);
    setRevealed(false);
    // 由目前的 queue 一次過算出「新隊列」及「下一張的位置」,避免兩次 setState 各自
    // 依據不同步的長度計算(舊做法會提早一格跳回開頭,打亂複習次序)。
    const next = [...queue];
    const [item] = next.splice(idx, 1);
    if (!remembered) next.push(item); // 忘記:移至隊尾,本次 session 會再出現一次
    setQueue(next);
    // 抽走之後,同一個 idx 已經指向下一張;到達結尾則返回開頭。
    setIdx(idx >= next.length ? 0 : idx);
  }

  const isVocab = current?.kind === "vocab";
  /**
   * 有原句就出題:先只顯示你當時寫錯的版本,由你講出正確講法,再揭曉。
   * 冇原句(舊資料或 AI 回應)就只能直接顯示 —— 見下面的提示。
   */
  const hasPrompt = !isVocab && !!current?.original;
  const quizzable = isVocab || hasPrompt;

  return (
    <div className="app">
      <header className="header">
        <h1>📅 Today’s Review</h1>
        <div className="controls">
          <Link className="ghost-btn" href="/saved">
            ★ Saved
          </Link>
          <Link className="ghost-btn" href="/">
            ← Back
          </Link>
        </div>
      </header>

      {!ready ? null : queue.length === 0 ? (
        <div className="messages">
          <div className="empty">
            {done > 0 ? (
              <>
                🎉 All done for today — {done} card{done === 1 ? "" : "s"} reviewed.
                <br />
                Come back tomorrow — spacing them out is what makes them stick.
              </>
            ) : (
              <>
                Nothing due today 🎉
                <br />
                Save more sentences or words while chatting and they will be scheduled here automatically.
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="messages review-wrap">
          <div className="review-progress">
            {queue.length} left · {done} done
          </div>

          <div className="review-card">
            <div className="review-kind">
              {isVocab ? "Word" : "Sentence"} · saved{" "}
              {new Date(current.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </div>

            {hasPrompt && !revealed ? (
              <>
                <div className="review-prompt-label">You wrote</div>
                <div className="review-text review-wrong">{current.original}</div>
                <div className="review-hint">Say it correctly, then check.</div>
              </>
            ) : (
              <div className="review-text">
                {current.text}
                <SpeakerButton text={current.text} title="Read aloud" />
              </div>
            )}

            {quizzable && !revealed && (
              <button className="ghost-btn" onClick={() => setRevealed(true)}>
                {isVocab ? "Show meaning" : "Show correct version"}
              </button>
            )}
            {isVocab && revealed && (
              <div className="review-answer">
                <div>{current.meaning}</div>
                {current.example && (
                  <div className="review-example">
                    {current.example}
                    <SpeakerButton text={current.example} title="Read the example aloud" />
                  </div>
                )}
              </div>
            )}
            {hasPrompt && revealed && current.explanation && (
              <div className="review-answer">{current.explanation}</div>
            )}

            {/* 未揭曉就顯示跟讀,等於提前洩漏答案,所以要等揭曉之後 */}
            {(!quizzable || revealed) && (
              <PronPractice
                target={isVocab ? current.example || current.text : current.text}
              />
            )}

            <div className="review-grade">
              <button className="grade-btn bad" onClick={() => grade(false)}>
                ✗ Forgot
              </button>
              <button className="grade-btn good" onClick={() => grade(true)}>
                ✓ Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
