"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import SpeakerButton from "@/components/SpeakerButton";
import { fetchTtsUrl, getCachedTtsUrl } from "@/lib/tts";
import {
  useSaved,
  removeSaved,
  exportSavedJson,
  importSavedItems,
  type SavedItem,
  type SavedKind,
} from "@/lib/savedStore";

const KIND_LABEL: Record<SavedKind, string> = {
  correction: "更正",
  rewrite: "完整句",
  reply: "AI 回應",
};

function fmt(ts: number): string {
  return new Date(ts).toLocaleString("zh-HK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SavedPage() {
  const { items } = useSaved();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const stopRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function backupJson() {
    const blob = new Blob([exportSavedJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `收藏備份-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setNote(null);
    try {
      const data = JSON.parse(await file.text());
      const arr = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
      const n = importSavedItems(arr);
      setNote(n > 0 ? `匯入咗 ${n} 句新收藏` : "冇新收藏可以匯入(已存在)");
    } catch {
      setError("匯入失敗:檔案格式唔啱");
    }
  }

  const allSelected = items.length > 0 && selected.size === items.length;
  const selectedItems = items.filter((i) => selected.has(i.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  }

  async function playList(list: SavedItem[]) {
    if (list.length === 0 || playing) return;
    stopRef.current = false;
    setPlaying(true);
    setError(null);
    for (const it of list) {
      if (stopRef.current) break;
      try {
        const url = await fetchTtsUrl(it.text);
        await new Promise<void>((resolve) => {
          const a = new Audio(url);
          audioRef.current = a;
          a.onended = () => resolve();
          a.onerror = () => resolve();
          a.play().catch(() => resolve());
        });
      } catch {
        /* 跳過壞嘅一句 */
      }
    }
    audioRef.current = null;
    setPlaying(false);
  }

  function stopPlay() {
    stopRef.current = true;
    audioRef.current?.pause();
    setPlaying(false);
  }

  async function exportMp3() {
    if (selectedItems.length === 0 || exporting) return;
    setExporting(true);
    setError(null);
    try {
      const payload = {
        items: selectedItems.map((i) => ({
          text: i.text,
          url: getCachedTtsUrl(i.text),
        })),
      };
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error || `匯出失敗 (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `review-${Date.now()}.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "匯出失敗");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>★ 我的收藏</h1>
        <div className="controls">
          <button className="ghost-btn" onClick={backupJson} title="匯出備份檔">
            ⬇ 備份
          </button>
          <button
            className="ghost-btn"
            onClick={() => fileRef.current?.click()}
            title="由備份檔匯入"
          >
            ⬆ 匯入
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={importBackup}
          />
          <Link className="ghost-btn" href="/">
            ← 返回
          </Link>
        </div>
      </header>

      {(note || error) && (
        <div className={`statusbar ${error ? "error" : ""}`}>
          {error ? `⚠️ ${error}` : `✓ ${note}`}
        </div>
      )}

      {items.length === 0 ? (
        <div className="messages">
          <div className="empty">
            仲未有收藏 😌
            <br />
            喺對話度撳句子旁邊嘅 ☆,就會記低喺呢度俾你日後複習。
          </div>
        </div>
      ) : (
        <>
          <div className="saved-toolbar">
            <button className="ghost-btn" onClick={toggleAll}>
              {allSelected ? "清除選擇" : "全選"}
            </button>
            <span className="saved-count">已選 {selected.size} / {items.length}</span>
            <div className="saved-toolbar-right">
              {playing ? (
                <button className="ghost-btn" onClick={stopPlay}>
                  ⏹ 停
                </button>
              ) : (
                <button
                  className="ghost-btn"
                  onClick={() => playList(selectedItems)}
                  disabled={selected.size === 0}
                >
                  ▶ 播放已選
                </button>
              )}
              <button
                className="primary-btn"
                onClick={exportMp3}
                disabled={selected.size === 0 || exporting}
              >
                {exporting ? "匯出緊…" : "⬇ 下載 MP3"}
              </button>
            </div>
          </div>

          <div className="messages saved-list">
            {items.map((it) => (
              <div className="saved-row" key={it.id}>
                <input
                  type="checkbox"
                  checked={selected.has(it.id)}
                  onChange={() => toggle(it.id)}
                />
                <div className="saved-main">
                  <div className="saved-text">{it.text}</div>
                  <div className="saved-meta">
                    <span className={`chip chip-${it.kind}`}>
                      {KIND_LABEL[it.kind]}
                    </span>
                    <span>{fmt(it.savedAt)}</span>
                  </div>
                </div>
                <div className="saved-actions">
                  <SpeakerButton text={it.text} title="讀出" />
                  <button
                    className="saver"
                    onClick={() => removeSaved(it.id)}
                    title="刪除"
                    aria-label="刪除"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
