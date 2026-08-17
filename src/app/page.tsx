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
  { value: "beginner", label: "初級" },
  { value: "intermediate", label: "中級" },
  { value: "advanced", label: "高級" },
];

type StreamEvent =
  | { t: "r"; reply: string }
  | {
      t: "f";
      reply: string;
      corrections: Correction[];
      rewrite: string;
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
        error: e instanceof Error ? e.message : "查詢失敗",
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
        throw new Error(e.error || `伺服器回覆 ${res.status}`);
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
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "發生錯誤,請再試一次。");
    } finally {
      setLoading(false);
      setStreamText("");
    }
  }

  function clearConvo() {
    if (!confirm("確定清除這段對話?")) return;
    updateActiveItems(() => []);
    setError(null);
  }

  function removeConvo() {
    if (!active) return;
    if (!confirm(`確定刪除「${active.title}」?`)) return;
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
        <h1>英文對話練習 🗣️</h1>
        {/* 分成兩組:手機上標題與導覽同一行,兩個下拉獨佔一行(見 globals.css 的
            @media 區塊)。合在一起的話,窄螢幕會把下拉擠到只剩幾個像素。 */}
        <div className="ctl-selects">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as Level)}
            aria-label="難度"
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
            aria-label="模型"
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m} value={m}>
                {/* 手機空間有限,「claude-」前綴沒有資訊量,予以略去 */}
                {m.replace(/^claude-/, "")}
              </option>
            ))}
          </select>
        </div>
        <div className="ctl-nav">
          <Link className="ghost-btn" href="/review" title="今日複習">
            📅 複習{dueCount > 0 ? ` (${dueCount})` : ""}
          </Link>
          <Link className="ghost-btn" href="/saved" title="我的收藏">
            ★ 收藏{savedItems.length > 0 ? ` (${savedItems.length})` : ""}
          </Link>
          {gated && (
            <button className="ghost-btn" onClick={logout} title="登出">
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
          aria-label="對話"
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
          aria-label="情境"
          title="選擇情境,AI 會扮演該角色與你練習"
        >
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id === "free" ? "💬" : "🎭"} {s.label}
            </option>
          ))}
        </select>
        <button className="ghost-btn" onClick={() => newConvo(active?.scenario)} title="新增對話">
          ＋ 新
        </button>
        <button className="ghost-btn" onClick={clearConvo} title="清空內容">
          清除
        </button>
        <button className="ghost-btn" onClick={removeConvo} title="刪除此對話">
          🗑
        </button>
      </div>

      <div className="messages" ref={messagesRef}>
        {items.length === 0 && !streamText && (
          <div className="empty">
            用英文輸入一句話,開始對話 👋
            <br />
            AI 會自然地回覆你,同時指出語法及用詞問題(以中文解釋)。
            <br />
            <span className="empty-hint">
              💡 點按 AI 回覆中不懂的字詞可查字典;選擇「🎭 情境」可進行角色扮演。
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
                <SpeakerButton text={it.content} title="讀出 AI 回覆" />
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
        {loading && !streamText && <div className="typing">AI 思考中…</div>}
      </div>

      {error && <div className="statusbar error">⚠️ {error}</div>}

      <div className="composer">
        {micSupported && (
          <button
            type="button"
            className={`mic ${recording ? "recording" : ""}`}
            onClick={recording ? stopRec : startRec}
            disabled={transcribing}
            title={recording ? "停止錄音" : "按此說英文"}
            aria-label={recording ? "停止錄音" : "錄音"}
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
              ? "錄音中…按 ⏹ 停止"
              : transcribing
                ? "轉換文字中…"
                : "用英文輸入…"
          }
          title="Enter 送出,Shift+Enter 換行"
          rows={1}
        />
        <button className="send" onClick={send} disabled={loading || !input.trim()}>
          送出
        </button>
      </div>

      <div className={`statusbar budget-${budgetLevel(usage)}`}>
        {/* sb-model / sb-month 於手機收起(頂部已顯示模型,本月數字非即時需要) */}
        <span className="sb-model">模型:{model}</span>
        <span>
          今日 ~{usage.today.tokens.toLocaleString()} / {DAILY_BUDGET.toLocaleString()}
        </span>
        <span className="sb-month">本月 ~{usage.month.tokens.toLocaleString()}</span>
        <span>
          🔊 {usage.today.tts} · 🎤 {usage.today.stt}
        </span>
        {budgetLevel(usage) !== "ok" && (
          <span className="budget-note">
            {budgetLevel(usage) === "over" ? "⚠️ 已超出預算" : "⚠️ 接近今日預算"}
          </span>
        )}
      </div>

      <VocabSheet lookup={lookup} onClose={() => setLookup(null)} />
    </div>
  );
}
