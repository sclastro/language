"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import FontSizeButton from "@/components/FontSizeButton";
import NavMenu from "@/components/NavMenu";
import {
  fetchTtsUrl,
  getCachedCdnUrl,
  getSpeechRate,
  playExclusive,
  setSpeechRate,
  stopCurrent,
  SPEECH_RATES,
} from "@/lib/tts";
import { countWords } from "@/lib/ttsLimit";
import {
  addListenHistory,
  passageTitle,
  sanitizeListenHistory,
  splitPassage,
  MAX_PASSAGE_WORDS,
  type ListenEntry,
} from "@/lib/listen";

const HISTORY_KEY = "english-tutor-listen-v1";
/** 同時生成幾段。太多會撞 Poe 的 rate limit,太少則第二段要等很久。 */
const CONCURRENCY = 3;

type Status = "idle" | "waiting" | "playing" | "paused";

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * 篇章轉語音:貼上已處理好的英文,直接朗讀,不經任何改寫。
 * 長文分段生成(見 lib/listen.ts),第一段好了就開始播,其餘在背景繼續生成。
 */
export default function ListenPage() {
  const [text, setText] = useState("");
  const [history, setHistory] = useState<ListenEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [rate, setRate] = useState(1);

  // 目前這一篇(按 Play 時的文字)的分段及進度
  const [chunks, setChunks] = useState<string[]>([]);
  const [sessionText, setSessionText] = useState("");
  const [readyCount, setReadyCount] = useState(0);
  const [current, setCurrent] = useState(-1);
  const [status, setStatus] = useState<Status>("idle");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const sessionRef = useRef(0); // 換了另一篇就加一,舊的生成工作見到便放棄
  const runRef = useRef(0); // 每次開始/跳段/停止就加一,舊的播放迴圈見到便退出
  const promisesRef = useRef<(Promise<string> | undefined)[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const finishRef = useRef<(() => void) | null>(null);
  const slotsRef = useRef(0);
  const waitersRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(sanitizeListenHistory(JSON.parse(raw)));
    } catch {
      /* 壞資料就當空 */
    }
    setRate(getSpeechRate());
    setHydrated(true);
    return () => {
      // 離開頁面:停止播放,未開始的生成亦放棄
      runRef.current++;
      sessionRef.current++;
      stopCurrent();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* 容量滿就算 */
    }
  }, [history, hydrated]);

  /** 簡單的併發上限(先到先得,所以會按段落次序生成)。 */
  async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (slotsRef.current >= CONCURRENCY) {
      await new Promise<void>((r) => waitersRef.current.push(r));
    }
    slotsRef.current++;
    try {
      return await fn();
    } finally {
      slotsRef.current--;
      waitersRef.current.shift()?.();
    }
  }

  /** 取得第 k 段的音訊;已在生成就沿用,失敗過的會重試。 */
  function ensure(list: string[], k: number): Promise<string> {
    const existing = promisesRef.current[k];
    if (existing) return existing;
    const session = sessionRef.current;
    const p = withSlot(async () => {
      if (session !== sessionRef.current) throw new Error("cancelled");
      return fetchTtsUrl(list[k]);
    });
    promisesRef.current[k] = p;
    p.then(
      () => {
        if (session === sessionRef.current) setReadyCount((n) => n + 1);
      },
      () => {
        if (promisesRef.current[k] === p) promisesRef.current[k] = undefined;
      }
    );
    return p;
  }

  /** 停止目前的播放迴圈(不影響背景生成)。 */
  function haltPlayback() {
    runRef.current++;
    audioRef.current?.pause();
    audioRef.current = null;
    finishRef.current?.();
    finishRef.current = null;
  }

  async function playFrom(list: string[], start: number) {
    haltPlayback();
    const run = runRef.current;
    for (let k = start; k < list.length; k++) {
      if (run !== runRef.current) return;
      setCurrent(k);
      setStatus("waiting");
      let url: string;
      try {
        url = await ensure(list, k);
      } catch (e) {
        if (run !== runRef.current) return;
        setStatus("idle");
        const msg = e instanceof Error && e.message !== "cancelled" ? ` (${e.message})` : "";
        setError(`Audio for part ${k + 1} could not be made${msg}. Press Play to try again.`);
        return;
      }
      if (run !== runRef.current) return;
      await new Promise<void>((resolve) => {
        const a = new Audio(url);
        audioRef.current = a;
        finishRef.current = resolve;
        a.onended = () => resolve();
        a.onerror = () => resolve();
        a.onplay = () => setStatus("playing");
        // 被其他 🔊 搶播或按了暫停:停在這段,按 Resume 由原處繼續
        a.onpause = () => {
          if (!a.ended && run === runRef.current) setStatus("paused");
        };
        playExclusive(a).catch(() => setStatus("paused"));
      });
    }
    if (run !== runRef.current) return;
    audioRef.current = null;
    setStatus("idle");
    setCurrent(-1);
  }

  const trimmed = text.trim();
  const words = countWords(trimmed);
  const tooLong = words > MAX_PASSAGE_WORDS;
  const sameAsSession = !!sessionText && trimmed === sessionText;

  /** 按 Play:文字有改動就當新的一篇重新分段;否則由頭再播(已生成的不再扣 points)。 */
  function start() {
    if (!trimmed || tooLong) return;
    setError(null);
    setNote(null);
    let list = chunks;
    if (!sameAsSession) {
      sessionRef.current++;
      promisesRef.current = [];
      list = splitPassage(trimmed);
      setChunks(list);
      setSessionText(trimmed);
      setReadyCount(0);
      setHistory((h) => addListenHistory(h, { id: newId(), text: trimmed, at: Date.now() }));
    }
    // 全篇在背景按次序生成,播放只需等目前那段
    list.forEach((_, k) => ensure(list, k).catch(() => {}));
    playFrom(list, 0);
  }

  function pause() {
    audioRef.current?.pause();
  }

  function resume() {
    const a = audioRef.current;
    if (a) playExclusive(a).catch(() => {});
  }

  function stop() {
    haltPlayback();
    setStatus("idle");
    setCurrent(-1);
  }

  function skip(delta: number) {
    if (current < 0) return;
    const k = Math.min(Math.max(current + delta, 0), chunks.length - 1);
    playFrom(chunks, k);
  }

  async function exportMp3() {
    if (!sameAsSession || exporting) return;
    setExporting(true);
    setError(null);
    setNote(null);
    try {
      // 先在前端生成齊全部段落,匯出時 server 只需下載及串接,不會逾時
      await Promise.all(chunks.map((_, k) => ensure(chunks, k)));
      const items = await Promise.all(
        chunks.map(async (c) => ({ text: c, url: await getCachedCdnUrl(c) }))
      );
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error || `Export failed (${res.status})`);
      }
      const included = Number(res.headers.get("x-included") ?? 0);
      const missing = Number(res.headers.get("x-missing") ?? 0);
      download(await res.blob(), `listen-${Date.now()}.mp3`);
      if (missing > 0) {
        // 不可靜靜少了一段
        setError(
          `The MP3 has ${included} of ${included + missing} parts — ${missing} could not be added. Try again.`
        );
      } else {
        setNote(`MP3 downloaded (${included} part${included === 1 ? "" : "s"}).`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  function openEntry(e: ListenEntry) {
    stop();
    setText(e.text);
    setError(null);
    setNote(null);
  }

  function removeEntry(id: string) {
    setHistory((h) => h.filter((e) => e.id !== id));
  }

  const active = status !== "idle";
  const total = chunks.length;

  return (
    <div className="app">
      <header className="header">
        <h1>🎧 Text to speech</h1>
        <div className="controls">
          <Link className="ghost-btn" href="/saved">
            ★ Saved
          </Link>
          <FontSizeButton />
          <NavMenu />
        </div>
      </header>

      {(note || error) && (
        <div className={`statusbar ${error ? "error" : ""}`}>
          {error ? `⚠️ ${error}` : `✓ ${note}`}
        </div>
      )}

      <div className="messages listen-wrap">
        <textarea
          className="listen-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your English text here. It is read out exactly as written."
          aria-label="Text to read aloud"
          lang="en"
          spellCheck={false}
        />
        <div className={`listen-count${tooLong ? " over" : ""}`}>
          {words} / {MAX_PASSAGE_WORDS} words
          {tooLong && " — too long. Please split it into two parts."}
        </div>

        <div className="listen-controls">
          {status === "playing" || status === "waiting" ? (
            <button className="primary-btn" onClick={pause} disabled={status === "waiting"}>
              ⏸ Pause
            </button>
          ) : status === "paused" ? (
            <button className="primary-btn" onClick={resume}>
              ▶ Resume
            </button>
          ) : (
            <button className="primary-btn" onClick={start} disabled={!trimmed || tooLong}>
              ▶ Play
            </button>
          )}
          {active && (
            <>
              <button className="ghost-btn" onClick={() => skip(-1)} disabled={current <= 0} title="Previous part">
                ⏮
              </button>
              <button
                className="ghost-btn"
                onClick={() => skip(1)}
                disabled={current >= total - 1}
                title="Next part"
              >
                ⏭
              </button>
              <button className="ghost-btn" onClick={stop}>
                ⏹ Stop
              </button>
            </>
          )}
          <select
            value={rate}
            onChange={(e) => {
              const r = Number(e.target.value);
              setRate(r);
              setSpeechRate(r);
            }}
            aria-label="Speech speed"
            title="Speed for playback in the app (the MP3 stays at normal speed)"
          >
            {SPEECH_RATES.map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
          <button
            className="ghost-btn"
            onClick={exportMp3}
            disabled={!sameAsSession || exporting}
            title={sameAsSession ? "Download the whole text as one MP3" : "Press Play first"}
          >
            {exporting ? "Preparing…" : "⬇ MP3"}
          </button>
          {text && !active && (
            <button className="ghost-btn" onClick={() => setText("")}>
              Clear
            </button>
          )}
        </div>

        {sameAsSession && total > 0 && (
          <div className="listen-status">
            {active && current >= 0 && (
              <span>
                {status === "waiting" ? "Making audio for" : "Part"} {current + 1} of {total}
              </span>
            )}
            <span className="listen-ready">
              Audio ready: {Math.min(readyCount, total)} / {total}
            </span>
            <div className="listen-bar">
              <div style={{ width: `${(Math.min(readyCount, total) / total) * 100}%` }} />
            </div>
          </div>
        )}
        {!!sessionText && !sameAsSession && trimmed && (
          <div className="listen-status">The text has changed — press Play to make new audio.</div>
        )}

        {history.length > 0 && (
          <div className="listen-history">
            <div className="listen-history-head">Recent</div>
            {history.map((e) => (
              <div className="lh-item" key={e.id}>
                <button className="lh-open" onClick={() => openEntry(e)} title="Open this text">
                  <span className="lh-title">{passageTitle(e.text)}</span>
                  <span className="lh-meta">
                    {countWords(e.text)} words ·{" "}
                    {new Date(e.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                </button>
                <button
                  className="tr-remove"
                  onClick={() => removeEntry(e.id)}
                  title="Remove from history"
                  aria-label="Remove from history"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
