"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import FontSizeButton from "@/components/FontSizeButton";
import NavMenu from "@/components/NavMenu";
import SpeakerButton from "@/components/SpeakerButton";
import SaveButton from "@/components/SaveButton";
import CopyButton from "@/components/CopyButton";
import { addSaved, useSaved } from "@/lib/savedStore";
import { fetchTtsUrl, playExclusive, stopCurrent } from "@/lib/tts";
import { addUsage } from "@/lib/usage";
import { SETTINGS_KEY } from "@/lib/models";
import type { Level } from "@/lib/types";
import {
  addPhraseSet,
  recentForTopic,
  sanitizePhraseSets,
  setSentences,
  PHRASE_FORMATS,
  PHRASE_SETS_KEY,
  MAX_TOPIC_CHARS,
  TOPICS,
  type PhraseFormat,
  type PhraseItem,
  type PhraseSet,
} from "@/lib/phrases";

const LEVELS: { value: Level; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

/** 揀了這個就顯示自訂主題輸入框。 */
const CUSTOM = "__custom__";

/** 上次揀的主題/形式,下次打開時沿用。 */
const FORM_KEY = "english-tutor-learn-form-v1";

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatLabel(f: PhraseFormat) {
  return PHRASE_FORMATS.find((x) => x.id === f)?.label ?? f;
}

/** 一句英文連 🔊 ☆ 📋;收藏時附中文意思及用法提示,複習時便可「看中文,講英文」。 */
function PhraseLine({ en, zh, note }: { en: string; zh: string; note?: string }) {
  return (
    <div className="tr-line">
      <span className="tr-text">{en}</span>
      <span className="tr-actions">
        <SpeakerButton text={en} title="Read aloud" />
        <SaveButton text={en} kind="phrase" original={zh} explanation={note} />
        <CopyButton text={en} title="Copy" />
      </span>
    </div>
  );
}

function ItemView({ item, format }: { item: PhraseItem; format: PhraseFormat }) {
  return (
    <div className={`ps-item ps-${format}`}>
      {item.speaker && <div className="ps-speaker">{item.speaker}</div>}
      <PhraseLine en={item.en} zh={item.zh} note={item.note} />
      <div className="ps-zh">{item.zh}</div>
      {item.note && <div className="ps-note">💡 {item.note}</div>}
      {item.examples && item.examples.length > 0 && (
        <div className="ps-examples">
          {item.examples.map((ex, i) => (
            <div className="ps-example" key={i}>
              <PhraseLine en={ex.en} zh={ex.zh} />
              <div className="ps-zh">{ex.zh}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 主題句庫:揀主題 → AI 給一批句子 → 讀、聽,把值得記的 ☆ 收藏(進入 SRS 複習),
 * 或者直接用這一批做 Quiz。
 */
export default function LearnPage() {
  const [sets, setSets] = useState<PhraseSet[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [topicChoice, setTopicChoice] = useState(TOPICS[0]);
  const [customTopic, setCustomTopic] = useState("");
  const [format, setFormat] = useState<PhraseFormat>("sentences");
  const [level, setLevel] = useState<Level>("intermediate");
  const [model, setModel] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [playingSet, setPlayingSet] = useState<string | null>(null);
  const stopRef = useRef(false);

  const { items: savedItems } = useSaved();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PHRASE_SETS_KEY);
      if (raw) {
        const list = sanitizePhraseSets(JSON.parse(raw));
        setSets(list);
        if (list[0]) setExpanded(new Set([list[0].id]));
      }
      // 難度及模型沿用對話頁的設定
      const s = localStorage.getItem(SETTINGS_KEY);
      if (s) {
        const v = JSON.parse(s) as { level?: Level; model?: string };
        if (v.level) setLevel(v.level);
        setModel(v.model);
      }
      const f = localStorage.getItem(FORM_KEY);
      if (f) {
        const v = JSON.parse(f) as { topic?: string; custom?: string; format?: PhraseFormat };
        if (v.topic && (v.topic === CUSTOM || TOPICS.includes(v.topic))) setTopicChoice(v.topic);
        if (typeof v.custom === "string") setCustomTopic(v.custom);
        if (v.format && PHRASE_FORMATS.some((x) => x.id === v.format)) setFormat(v.format);
      }
    } catch {
      /* 壞資料就當空 */
    }
    setHydrated(true);
    return () => {
      stopRef.current = true;
      stopCurrent();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(PHRASE_SETS_KEY, JSON.stringify(sets));
      localStorage.setItem(
        FORM_KEY,
        JSON.stringify({ topic: topicChoice, custom: customTopic, format })
      );
    } catch {
      /* 容量滿就算 */
    }
  }, [sets, topicChoice, customTopic, format, hydrated]);

  const topic = (topicChoice === CUSTOM ? customTopic : topicChoice).trim();

  async function generate(opts?: { topic: string; format: PhraseFormat; level: Level }) {
    const t = opts?.topic ?? topic;
    const f = opts?.format ?? format;
    const l = opts?.level ?? level;
    if (!t || pending) return;
    setError(null);
    setNote(null);
    setPending(`${t} · ${formatLabel(f)}`);
    try {
      const res = await fetch("/api/phrases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: t, format: f, level: l, model, avoid: recentForTopic(sets, t) }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        title?: string;
        items?: PhraseItem[];
        truncated?: boolean;
        error?: string;
        usage?: { totalTokens?: number };
      };
      if (!res.ok || !data.items?.length) {
        throw new Error(data.error || `Server responded ${res.status}`);
      }
      if (data.usage?.totalTokens) addUsage({ tokens: data.usage.totalTokens });
      const set: PhraseSet = {
        id: newId(),
        topic: t,
        level: l,
        format: f,
        title: data.title || t,
        items: data.items,
        at: Date.now(),
      };
      setSets((s) => addPhraseSet(s, set));
      setExpanded((e) => new Set(e).add(set.id));
      if (data.truncated) setNote("The reply was cut short, so this set has fewer items than usual.");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setPending(null);
    }
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function removeSet(id: string) {
    if (!confirm("Delete this set? Sentences you saved (★) are kept.")) return;
    setSets((s) => s.filter((x) => x.id !== id));
  }

  function saveAll(set: PhraseSet) {
    const have = new Set(savedItems.filter((i) => i.kind === "phrase").map((i) => i.text));
    let added = 0;
    const add = (en: string, zh: string, explanation?: string) => {
      if (!have.has(en)) added++;
      addSaved(en, "phrase", { original: zh, explanation });
    };
    for (const it of set.items) {
      add(it.en, it.zh, it.note);
      for (const ex of it.examples ?? []) add(ex.en, ex.zh);
    }
    setError(null);
    setNote(
      added
        ? `Saved ${added} sentence${added === 1 ? "" : "s"} — they will show up in Today’s review.`
        : "These are all saved already."
    );
  }

  async function playAll(set: PhraseSet) {
    if (playingSet) return;
    stopRef.current = false;
    setPlayingSet(set.id);
    for (const s of setSentences(set)) {
      if (stopRef.current) break;
      try {
        const url = await fetchTtsUrl(s.en);
        if (stopRef.current) break;
        await new Promise<void>((resolve) => {
          const a = new Audio(url);
          a.onended = () => resolve();
          a.onerror = () => resolve();
          // 播放中撳了某一句的 🔊:整串停下,不要搶回來繼續播
          a.onpause = () => {
            if (!a.ended) stopRef.current = true;
            resolve();
          };
          playExclusive(a).catch(() => resolve());
        });
      } catch {
        /* 跳過無法生成的句子 */
      }
    }
    setPlayingSet(null);
  }

  function stopAll() {
    stopRef.current = true;
    stopCurrent();
    setPlayingSet(null);
  }

  return (
    <div className="app">
      <header className="header">
        <h1>📚 Phrase library</h1>
        <div className="controls">
          <Link className="ghost-btn" href="/quiz">
            📝 Quiz
          </Link>
          <FontSizeButton />
          <NavMenu />
        </div>
      </header>

      <div className="learn-form">
        <select
          className="learn-topic"
          value={topicChoice}
          onChange={(e) => setTopicChoice(e.target.value)}
          aria-label="Topic"
        >
          {TOPICS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          <option value={CUSTOM}>✏️ My own topic…</option>
        </select>
        {topicChoice === CUSTOM && (
          <input
            className="learn-custom"
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            onKeyDown={(e) => {
              // 中文輸入法選字時的 Enter 不可當成送出
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === "Enter") generate();
            }}
            placeholder="e.g. Returning a faulty phone, 同保險公司講索償"
            maxLength={MAX_TOPIC_CHARS}
            aria-label="Your own topic"
          />
        )}
        <div className="learn-row">
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as PhraseFormat)}
            aria-label="Format"
          >
            {PHRASE_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <select value={level} onChange={(e) => setLevel(e.target.value as Level)} aria-label="Level">
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <button className="primary-btn" onClick={() => generate()} disabled={!topic || !!pending}>
            {pending ? "Preparing…" : "✨ Get sentences"}
          </button>
        </div>
      </div>

      {(note || error) && (
        <div className={`statusbar ${error ? "error" : ""}`}>
          {error ? `⚠️ ${error}` : `✓ ${note}`}
        </div>
      )}

      <div className="messages">
        {pending && (
          <div className="tr-card tr-pending">
            <div className="tr-zh">
              <span>{pending}</span>
            </div>
            <div className="typing">Preparing sentences…</div>
          </div>
        )}

        {hydrated && sets.length === 0 && !pending && (
          <div className="empty">
            Pick a topic and get ready-made English to study 📚
            <br />
            Listen, tap ☆ on the ones you want to remember, and they go into your daily review.
            <br />
            <span className="empty-hint">Then test yourself with 📝 Quiz.</span>
          </div>
        )}

        {sets.map((set) => {
          const open = expanded.has(set.id);
          return (
            <div className="tr-card ps-card" key={set.id}>
              <button className="ps-head" onClick={() => toggle(set.id)} aria-expanded={open}>
                <span className="ps-title">
                  {open ? "▾" : "▸"} {set.title}
                </span>
                <span className="ps-meta">
                  {set.topic !== set.title ? `${set.topic} · ` : ""}
                  {formatLabel(set.format)} · {set.level} · {set.items.length} items ·{" "}
                  {new Date(set.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </button>
              {open && (
                <>
                  <div className="ps-actions">
                    {playingSet === set.id ? (
                      <button className="ghost-btn" onClick={stopAll}>
                        ⏹ Stop
                      </button>
                    ) : (
                      <button className="ghost-btn" onClick={() => playAll(set)} disabled={!!playingSet}>
                        ▶ Play all
                      </button>
                    )}
                    <button className="ghost-btn" onClick={() => saveAll(set)} title="Save every sentence for review">
                      ☆ Save all
                    </button>
                    <Link className="ghost-btn" href={`/quiz?set=${set.id}`}>
                      📝 Quiz
                    </Link>
                    <button
                      className="ghost-btn"
                      onClick={() => generate({ topic: set.topic, format: set.format, level: set.level })}
                      disabled={!!pending}
                      title="Get a new set on the same topic (no repeats)"
                    >
                      ＋ More
                    </button>
                    <button className="ghost-btn" onClick={() => removeSet(set.id)} title="Delete this set">
                      🗑
                    </button>
                  </div>
                  <div className="ps-items">
                    {set.items.map((it, i) => (
                      <ItemView key={i} item={it} format={set.format} />
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
