"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SpeakerButton from "@/components/SpeakerButton";
import PronPractice from "@/components/PronPractice";
import { dueItems, reviewItem, type SavedItem } from "@/lib/savedStore";

/** 今日複習:SRS 到期嘅收藏,一張一張咁溫,記得/唔記得決定下次幾時再出。 */
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
    if (!remembered) {
      // 唔記得:移去隊尾,今次 session 再出一次
      setQueue((q) => {
        const copy = [...q];
        const [item] = copy.splice(idx, 1);
        copy.push(item);
        return copy;
      });
      // idx 不變(下一張已補上)。如果已經係最尾,回到頭。
      setIdx((i) => (i >= queue.length - 1 ? 0 : i));
    } else {
      setQueue((q) => q.filter((_, i) => i !== idx));
      setIdx((i) => (i >= queue.length - 2 ? 0 : i));
    }
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
                🎉 今日複習完晒!溫咗 {done} 張卡。
                <br />
                聽日再嚟,間隔重複先至記得牢。
              </>
            ) : (
              <>
                今日冇嘢要複習 🎉
                <br />
                去對話度收藏多啲句子/生字,呢度就會自動幫你排複習時間。
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="messages review-wrap">
          <div className="review-progress">
            剩返 {queue.length} 張 · 已溫 {done} 張
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
                ✗ 唔記得
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
