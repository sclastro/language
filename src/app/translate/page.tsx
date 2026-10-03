"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SpeakerButton from "@/components/SpeakerButton";
import SaveButton from "@/components/SaveButton";
import CopyButton from "@/components/CopyButton";
import { addUsage } from "@/lib/usage";
import { SETTINGS_KEY } from "@/lib/models";
import {
  addToHistory,
  sanitizeHistory,
  MAX_INPUT_CHARS,
  type Translation,
  type TranslationEntry,
} from "@/lib/translate";

/** 翻譯歷史只存本機;值得留低的句子用 ☆ 收藏,收藏會備份及同步。 */
const HISTORY_KEY = "english-tutor-translations-v1";

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 一句英文連同 🔊 ☆ 📋;收藏時附上中文原文,複習時便可出「用英文講出來」的題。 */
function EnglishLine({ text, chinese, main }: { text: string; chinese: string; main?: boolean }) {
  return (
    <div className={`tr-line${main ? " tr-main" : ""}`}>
      <span className="tr-text">{text}</span>
      <span className="tr-actions">
        <SpeakerButton text={text} title="Read aloud" />
        <SaveButton text={text} kind="translation" original={chinese} />
        <CopyButton text={text} title="Copy" />
      </span>
    </div>
  );
}

/** 中文(可以是廣東話口語)→ 簡單口語英文,即時可用。 */
export default function TranslatePage() {
  const [history, setHistory] = useState<TranslationEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | undefined>(undefined);

  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(sanitizeHistory(JSON.parse(raw)));
      // 沿用對話頁揀選的模型
      const s = localStorage.getItem(SETTINGS_KEY);
      if (s) setModel((JSON.parse(s) as { model?: string }).model);
    } catch {
      /* 壞資料就當空 */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* 容量滿就算 */
    }
  }, [history, hydrated]);

  // 最新一項在最下面(貼近輸入框),所以有新結果就捲到底
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [history, pending]);

  // 輸入框自動長高(最多約 7 行)
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 168) + "px";
  }, [input]);

  async function translate() {
    const text = input.trim();
    if (!text || pending) return;
    setError(null);
    setPending(text);
    setInput("");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, model }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Translation> & {
        error?: string;
        usage?: { totalTokens?: number };
      };
      if (!res.ok || !data.english) {
        throw new Error(data.error || `Server responded ${res.status}`);
      }
      if (data.usage?.totalTokens) addUsage({ tokens: data.usage.totalTokens });
      const entry: TranslationEntry = {
        id: newId(),
        chinese: text,
        english: data.english,
        alternatives: data.alternatives ?? [],
        at: Date.now(),
      };
      setHistory((h) => addToHistory(h, entry));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      // 失敗就把原文放回輸入框,不要令用戶重打
      setInput((cur) => (cur.trim() ? cur : text));
    } finally {
      setPending(null);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // ⚠️ 中文輸入法選字時按 Enter 是「確認候選字」,不可當成送出;
    // isComposing 在部分瀏覽器不可靠,keyCode 229 是後備判斷。
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      translate();
    }
  }

  function remove(id: string) {
    setHistory((h) => h.filter((e) => e.id !== id));
  }

  function clearAll() {
    if (!confirm("Clear the translation history? Saved (★) items are kept.")) return;
    setHistory([]);
  }

  // 儲存時最新在前;顯示時倒轉,最新貼近輸入框
  const shown = [...history].reverse();

  return (
    <div className="app">
      <header className="header">
        <h1>🌐 Chinese → English</h1>
        <div className="controls">
          <Link className="ghost-btn" href="/saved">
            ★ Saved
          </Link>
          <Link className="ghost-btn" href="/">
            ← Back
          </Link>
        </div>
      </header>

      <div className="messages" ref={listRef}>
        {hydrated && history.length === 0 && !pending && (
          <div className="empty">
            Type what you want to say in Chinese 💬
            <br />
            You get short, simple English you can say or send right away.
            <br />
            <span className="empty-hint">Cantonese wording is fine. Tap ☆ to keep a phrase for review.</span>
          </div>
        )}

        {shown.map((e) => (
          <div className="tr-card" key={e.id}>
            <div className="tr-zh">
              <span>{e.chinese}</span>
              <button
                className="tr-remove"
                onClick={() => remove(e.id)}
                title="Remove from history"
                aria-label="Remove from history"
              >
                ×
              </button>
            </div>
            <EnglishLine text={e.english} chinese={e.chinese} main />
            {e.alternatives.length > 0 && (
              <div className="tr-alts">
                <div className="tr-alts-head">Other ways to say it</div>
                {e.alternatives.map((a, i) => (
                  <EnglishLine key={i} text={a} chinese={e.chinese} />
                ))}
              </div>
            )}
          </div>
        ))}

        {/* 清除掣放在清單末端而非頂部:手機上頂部多一個掣,標題列就要分兩行 */}
        {history.length > 1 && !pending && (
          <button className="tr-clear" onClick={clearAll}>
            Clear history
          </button>
        )}

        {pending && (
          <div className="tr-card tr-pending">
            <div className="tr-zh">
              <span>{pending}</span>
            </div>
            <div className="typing">Translating…</div>
          </div>
        )}
      </div>

      {error && <div className="statusbar error">⚠️ {error}</div>}

      <div className="composer">
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type in Chinese…"
          title="Enter to translate, Shift+Enter for a new line"
          maxLength={MAX_INPUT_CHARS}
          rows={1}
          lang="zh-Hant"
        />
        <button className="send" onClick={translate} disabled={!!pending || !input.trim()}>
          Translate
        </button>
      </div>
    </div>
  );
}
