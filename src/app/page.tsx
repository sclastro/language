"use client";

import { useEffect, useRef, useState } from "react";
import CorrectionCard from "@/components/CorrectionCard";
import SpeakerButton from "@/components/SpeakerButton";
import { useRecorder } from "@/hooks/useRecorder";
import type {
  ChatApiResponse,
  ChatMessage,
  Correction,
  Level,
} from "@/lib/types";
import { AVAILABLE_MODELS, CLIENT_DEFAULT_MODEL } from "@/lib/models";

/** 一格對話:用戶嗰句會夾埋 AI 俾嘅糾正。 */
type UserItem = { kind: "user"; content: string; corrections?: Correction[] };
type AssistantItem = { kind: "assistant"; content: string };
type Item = UserItem | AssistantItem;

const STORAGE_KEY = "english-tutor-state-v1";

const LEVELS: { value: Level; label: string }[] = [
  { value: "beginner", label: "初級" },
  { value: "intermediate", label: "中級" },
  { value: "advanced", label: "高級" },
];

type SavedState = {
  items: Item[];
  level: Level;
  model: string;
  totalTokens: number;
};

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [level, setLevel] = useState<Level>("intermediate");
  const [model, setModel] = useState<string>(CLIENT_DEFAULT_MODEL);
  const [totalTokens, setTotalTokens] = useState(0);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [gated, setGated] = useState(false); // 有冇開密碼保護(睇可讀 cookie)

  const messagesRef = useRef<HTMLDivElement>(null);

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

  // 由 localStorage 還原
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as SavedState;
        if (Array.isArray(s.items)) setItems(s.items);
        if (s.level) setLevel(s.level);
        if (s.model) setModel(s.model);
        if (typeof s.totalTokens === "number") setTotalTokens(s.totalTokens);
      }
    } catch {
      /* 壞資料就當冇 */
    }
    setHydrated(true);
    setGated(document.cookie.split("; ").some((c) => c === "et_ui=1"));
  }, []);

  async function logout() {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }

  // 存返 localStorage
  useEffect(() => {
    if (!hydrated) return;
    const s: SavedState = { items, level, model, totalTokens };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      /* 容量滿就算 */
    }
  }, [items, level, model, totalTokens, hydrated]);

  // 自動捲到底
  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
  }, [items, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setError(null);
    setInput("");

    // 先樂觀顯示用戶嗰句
    const nextItems: Item[] = [...items, { kind: "user", content: text }];
    setItems(nextItems);
    setLoading(true);

    // 由 items 砌返純對話歷史(唔帶 corrections)
    const history: ChatMessage[] = nextItems.map((it) => ({
      role: it.kind,
      content: it.content,
    }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, level, model }),
      });
      const data = (await res.json()) as ChatApiResponse & { error?: string };

      if (!res.ok || data.error) {
        throw new Error(data.error || `伺服器回覆 ${res.status}`);
      }

      // 將 corrections 貼返最後一句 user,再加 AI 回覆
      setItems((prev) => {
        const copy = [...prev];
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].kind === "user") {
            copy[i] = { ...(copy[i] as UserItem), corrections: data.corrections };
            break;
          }
        }
        copy.push({ kind: "assistant", content: data.reply });
        return copy;
      });

      if (data.usage) {
        setTotalTokens((t) => t + data.usage!.totalTokens);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "出咗啲問題,請再試。");
    } finally {
      setLoading(false);
    }
  }

  function clearAll() {
    if (!confirm("清除成段對話?")) return;
    setItems([]);
    setError(null);
    setTotalTokens(0);
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
        <div className="controls">
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
                {m}
              </option>
            ))}
          </select>
          <button className="ghost-btn" onClick={clearAll}>
            清除
          </button>
          {gated && (
            <button className="ghost-btn" onClick={logout} title="登出">
              🔒
            </button>
          )}
        </div>
      </header>

      <div className="messages" ref={messagesRef}>
        {items.length === 0 && (
          <div className="empty">
            用英文打句嘢開始傾偈啦 👋
            <br />
            AI 會自然咁回你,同時幫你捉語法同用詞嘅問題(用中文解釋)。
          </div>
        )}

        {items.map((it, i) =>
          it.kind === "user" ? (
            <div key={i} className="row user">
              <div className="bubble">{it.content}</div>
              {it.corrections && <CorrectionCard corrections={it.corrections} />}
            </div>
          ) : (
            <div key={i} className="row assistant">
              <div className="bubble">{it.content}</div>
              <SpeakerButton text={it.content} title="讀出 AI 回覆" />
            </div>
          )
        )}

        {loading && <div className="typing">AI 諗緊…</div>}
      </div>

      {error && <div className="statusbar error">⚠️ {error}</div>}

      <div className="composer">
        {micSupported && (
          <button
            type="button"
            className={`mic ${recording ? "recording" : ""}`}
            onClick={recording ? stopRec : startRec}
            disabled={transcribing}
            title={recording ? "停止錄音" : "㩒住講英文"}
            aria-label={recording ? "停止錄音" : "錄音"}
          >
            {transcribing ? "…" : recording ? "⏹" : "🎤"}
          </button>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            recording
              ? "錄緊音…㩒 ⏹ 停"
              : transcribing
                ? "轉緊文字…"
                : "Type in English…  (Enter 送出,Shift+Enter 換行)"
          }
          rows={1}
        />
        <button className="send" onClick={send} disabled={loading || !input.trim()}>
          送出
        </button>
      </div>

      <div className="statusbar">
        <span>模型:{model}</span>
        <span>今次 session 約用咗 {totalTokens.toLocaleString()} tokens</span>
      </div>
    </div>
  );
}
