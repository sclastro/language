"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import CorrectionCard from "@/components/CorrectionCard";
import SpeakerButton from "@/components/SpeakerButton";
import SaveButton from "@/components/SaveButton";
import VocabSheet, {
  TappableText,
  lookupWord,
  type LookupState,
} from "@/components/VocabSheet";
import { useRecorder } from "@/hooks/useRecorder";
import { useSaved, dueItems } from "@/lib/savedStore";
import { SPEECH_RATES, getSpeechRate, setSpeechRate } from "@/lib/tts";
import { addUsage, useUsage, budgetLevel, DAILY_BUDGET } from "@/lib/usage";
import {
  useConvos,
  getActive,
  setActive,
  newConvo,
  deleteConvo,
  setScenario,
  updateActiveItems,
  type UserItem,
  type ChatItem,
} from "@/lib/convoStore";
import { SCENARIOS, type ScenarioId } from "@/lib/scenarios";
import type { ChatMessage, Correction, Level } from "@/lib/types";
import { AVAILABLE_MODELS, CLIENT_DEFAULT_MODEL } from "@/lib/models";

const SETTINGS_KEY = "english-tutor-settings-v1";

const LEVELS: { value: Level; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

type StreamEvent =
  | { t: "r"; reply: string }
  | {
      t: "f";
      reply: string;
      corrections: Correction[];
      rewrite: string;
      truncated?: boolean;
      usage?: { totalTokens: number };
    }
  | { t: "e"; error: string };

export default function Home() {
  const convosState = useConvos();
  const active = convosState.convos.find((c) => c.id === convosState.activeId);
  const items: ChatItem[] = active?.items ?? [];

  const [level, setLevel] = useState<Level>("intermediate");
  const [model, setModel] = useState<string>(CLIENT_DEFAULT_MODEL);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [gated, setGated] = useState(false);
  const [lookup, setLookup] = useState<LookupState | null>(null);
  const [dueCount, setDueCount] = useState(0);
  // 朗讀速度(全 app 共用,存 localStorage)。1 = 原速。
  const [rate, setRate] = useState(1);

  const messagesRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const { items: savedItems } = useSaved();
  const usage = useUsage();

  // 輸入框自動長高(最多 ~7 行)
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 168) + "px";
  }, [input]);

  const {
    recording,
    transcribing,
    supported: micSupported,
    start: startRec,
    stop: stopRec,
  } = useRecorder({
    onResult: (t) => setInput((prev) => (prev ? prev.trimEnd() + " " : "") + t),
    onError: (m) => setError(m),
  });

  // 還原設定 + gate 狀態 + 今日複習數
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const s = JSON.parse(raw) as { level?: Level; model?: string };
        if (s.level) setLevel(s.level);
        if (s.model) setModel(s.model);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
    setGated(document.cookie.split("; ").some((c) => c === "et_ui=1"));
    setDueCount(dueItems().length);
    setRate(getSpeechRate());
  }, []);

  useEffect(() => {
    setDueCount(dueItems().length);
  }, [savedItems]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ level, model }));
    } catch {
      /* ignore */
    }
  }, [level, model, hydrated]);

  // 自動捲到底
  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
  }, [items, loading, streamText]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }

  async function onWordTap(word: string, sentence: string) {
    setLookup({ word, sentence, loading: true });
    try {
      const r = await lookupWord(word, sentence);
      setLookup({ word, sentence, loading: false, ...r });
    } catch (e) {
      setLookup({
        word,
        sentence,
        loading: false,
        error: e instanceof Error ? e.message : "Lookup failed",
      });
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setError(null);
    setInput("");
    updateActiveItems((prev) => [...prev, { kind: "user", content: text }]);
    setLoading(true);
    setStreamText("");
    let gotReply = false;

    const history: ChatMessage[] = [...items, { kind: "user", content: text } as ChatItem].map(
      (it) => ({ role: it.kind as "user" | "assistant", content: it.content })
    );

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          level,
          model,
          scenario: active?.scenario ?? "free",
        }),
      });

      if (!res.ok || !res.body) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error || `Server responded ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finished = false;

      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          const line = ev.trim();
          if (!line.startsWith("data: ")) continue;
          let payload: StreamEvent;
          try {
            payload = JSON.parse(line.slice(6)) as StreamEvent;
          } catch {
            continue;
          }
          if (payload.t === "r") {
            setStreamText(payload.reply);
          } else if (payload.t === "e") {
            throw new Error(payload.error);
          } else if (payload.t === "f") {
            finished = true;
            gotReply = true;
            updateActiveItems((prev) => {
              const copy = [...prev];
              for (let i = copy.length - 1; i >= 0; i--) {
                if (copy[i].kind === "user") {
                  copy[i] = {
                    ...(copy[i] as UserItem),
                    corrections: payload.corrections,
                    rewrite: payload.rewrite,
                  };
                  break;
                }
              }
              copy.push({ kind: "assistant", content: payload.reply });
              return copy;
            });
            if (payload.usage?.totalTokens) {
              addUsage({ tokens: payload.usage.totalTokens });
            }
            // 輸出被截斷 → 搶救到的糾正可能不齊,要講返俾用戶知,唔好靜靜收貨。
            if (payload.truncated) {
              setError(
                "The reply hit the length limit, so some corrections may be missing. Try sending a shorter message."
              );
            }
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      // 失敗就回復到「按送出之前」的狀態:打好的字放返輸入框,並移走那句
      // 得不到回覆的訊息。否則辛苦打的內容會白白消失,而且要重新輸入一次。
      if (!gotReply) {
        updateActiveItems((prev) => {
          const last = prev[prev.length - 1];
          if (last?.kind === "user" && last.content === text && !last.corrections) {
            return prev.slice(0, -1);
          }
          return prev;
        });
        setInput((cur) => (cur.trim() ? cur : text));
      }
    } finally {
      setLoading(false);
      setStreamText("");
    }
  }

  function clearConvo() {
    if (!confirm("Clear this conversation?")) return;
    updateActiveItems(() => []);
    setError(null);
  }

  function removeConvo() {
    if (!active) return;
    if (!confirm(`Delete "${active.title}"?`)) return;
    deleteConvo(active.id);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>English Tutor 🗣️</h1>
        {/* 分成兩組:手機上標題與導覽同一行,兩個下拉獨佔一行(見 globals.css 的
            @media 區塊)。合在一起的話,窄螢幕會把下拉擠到只剩幾個像素。 */}
        <div className="ctl-selects">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as Level)}
            aria-label="Level"
          >
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            aria-label="Model"
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m} value={m}>
                {/* 手機空間有限,「claude-」前綴沒有資訊量,予以略去 */}
                {m.replace(/^claude-/, "")}
              </option>
            ))}
          </select>
          <select
            className="rate-select"
            value={rate}
            onChange={(e) => {
              const r = Number(e.target.value);
              setRate(r);
              setSpeechRate(r);
            }}
            aria-label="Speech speed"
            title="Speed for 🔊 playback in the app (the exported MP3 stays at normal speed)"
          >
            {SPEECH_RATES.map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </div>
        <div className="ctl-nav">
          <Link className="ghost-btn" href="/review" title="Today's review">
            📅 <span className="nav-label">Review</span>
            {dueCount > 0 && <span className="nav-count">{dueCount}</span>}
          </Link>
          <Link className="ghost-btn" href="/saved" title="Saved items">
            ★ <span className="nav-label">Saved</span>
            {savedItems.length > 0 && (
              <span className="nav-count">{savedItems.length}</span>
            )}
          </Link>
          {gated && (
            <button className="ghost-btn" onClick={logout} title="Log out">
              🔒
            </button>
          )}
        </div>
      </header>

      <div className="convo-bar">
        <select
          className="convo-select"
          value={active?.id ?? ""}
          onChange={(e) => setActive(e.target.value)}
          aria-label="Conversation"
        >
          {convosState.convos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <select
          value={active?.scenario ?? "free"}
          onChange={(e) => active && setScenario(active.id, e.target.value as ScenarioId)}
          aria-label="Scenario"
          title="Pick a scenario and the AI will play that role with you"
        >
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id === "free" ? "💬" : "🎭"} {s.label}
            </option>
          ))}
        </select>
        <button className="ghost-btn" onClick={() => newConvo(active?.scenario)} title="New conversation">
          ＋ New
        </button>
        <button className="ghost-btn" onClick={clearConvo} title="Clear messages">
          Clear
        </button>
        <button className="ghost-btn" onClick={removeConvo} title="Delete this conversation">
          🗑
        </button>
      </div>

      <div className="messages" ref={messagesRef}>
        {items.length === 0 && !streamText && (
          <div className="empty">
            Type something in English to start 👋
            <br />
            The AI replies naturally and points out grammar and word-choice issues.
            <br />
            <span className="empty-hint">
              💡 Tap any word in a reply to look it up. Pick a 🎭 scenario for role-play.
            </span>
          </div>
        )}

        {items.map((it, i) =>
          it.kind === "user" ? (
            <div key={i} className="row user">
              <div className="bubble">{it.content}</div>
              {it.corrections && (
                <CorrectionCard
                  corrections={it.corrections}
                  rewrite={it.rewrite}
                  original={it.content}
                />
              )}
            </div>
          ) : (
            <div key={i} className="row assistant">
              <div className="bubble">
                <TappableText text={it.content} onWord={onWordTap} />
              </div>
              <div className="bubble-actions">
                <SpeakerButton text={it.content} title="Read the reply aloud" />
                <SaveButton text={it.content} kind="reply" />
              </div>
            </div>
          )
        )}

        {streamText && (
          <div className="row assistant">
            <div className="bubble">{streamText}▍</div>
          </div>
        )}
        {loading && !streamText && <div className="typing">AI is thinking…</div>}
      </div>

      {error && <div className="statusbar error">⚠️ {error}</div>}

      <div className="composer">
        {micSupported && (
          <button
            type="button"
            className={`mic ${recording ? "recording" : ""}`}
            onClick={recording ? stopRec : startRec}
            disabled={transcribing}
            title={recording ? "Stop recording" : "Tap to speak English"}
            aria-label={recording ? "Stop recording" : "Record"}
          >
            {transcribing ? "…" : recording ? "⏹" : "🎤"}
          </button>
        )}
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            recording
              ? "Recording… tap ⏹ to stop"
              : transcribing
                ? "Transcribing…"
                : "Type in English…"
          }
          title="Enter to send, Shift+Enter for a new line"
          rows={1}
        />
        <button className="send" onClick={send} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>

      <div className={`statusbar budget-${budgetLevel(usage)}`}>
        {/* sb-model / sb-month 於手機收起(頂部已顯示模型,本月數字非即時需要) */}
        <span className="sb-model">Model: {model}</span>
        <span>
          Today ~{usage.today.tokens.toLocaleString()} / {DAILY_BUDGET.toLocaleString()}
        </span>
        <span className="sb-month">Month ~{usage.month.tokens.toLocaleString()}</span>
        <span>
          🔊 {usage.today.tts} · 🎤 {usage.today.stt}
        </span>
        {budgetLevel(usage) !== "ok" && (
          <span className="budget-note">
            {budgetLevel(usage) === "over" ? "⚠️ Over budget" : "⚠️ Near today's budget"}
          </span>
        )}
      </div>

      <VocabSheet lookup={lookup} onClose={() => setLookup(null)} />
    </div>
  );
}
