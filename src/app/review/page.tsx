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

  return (
    <div className="app">
      <header className="header">
        <h1>📅 今日複習</h1>
        <div className="controls">
          <Link className="ghost-btn" href="/saved">
            ★ 收藏
          </Link>
          <Link className="ghost-btn" href="/">
            ← 返回
          </Link>
        </div>
      </header>

      {!ready ? null : queue.length === 0 ? (
        <div className="messages">
          <div className="empty">
            {done > 0 ? (
              <>
                🎉 今日已複習完畢!共完成 {done} 張卡。
                <br />
                明天再來,間隔重複才能記得牢固。
              </>
            ) : (
              <>
                今日沒有需要複習的項目 🎉
                <br />
                在對話中收藏更多句子或生字,系統就會自動為你安排複習時間。
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="messages review-wrap">
          <div className="review-progress">
            剩餘 {queue.length} 張 · 已完成 {done} 張
          </div>

          <div className="review-card">
            <div className="review-kind">
              {isVocab ? "生字" : "句子"} · 收藏於{" "}
              {new Date(current.savedAt).toLocaleDateString("zh-HK")}
            </div>

            <div className="review-text">
              {current.text}
              <SpeakerButton text={current.text} title="讀出" />
            </div>

            {isVocab && !revealed && (
              <button className="ghost-btn" onClick={() => setRevealed(true)}>
                顯示解釋
              </button>
            )}
            {isVocab && revealed && (
              <div className="review-answer">
                <div>{current.meaning}</div>
                {current.example && (
                  <div className="review-example">
                    {current.example}
                    <SpeakerButton text={current.example} title="讀出例句" />
                  </div>
                )}
              </div>
            )}

            <PronPractice target={isVocab ? current.example || current.text : current.text} />

            <div className="review-grade">
              <button className="grade-btn bad" onClick={() => grade(false)}>
                ✗ 忘記了
              </button>
              <button className="grade-btn good" onClick={() => grade(true)}>
                ✓ 記得
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
