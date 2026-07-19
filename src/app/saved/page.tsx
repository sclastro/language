"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SpeakerButton from "@/components/SpeakerButton";
import { fetchTtsUrl, getCachedCdnUrl } from "@/lib/tts";
import {
  useSaved,
  removeSaved,
  exportSavedJson,
  importSavedItems,
  getAllSaved,
  mergeSaved,
  replaceAll,
  type SavedItem,
  type SavedKind,
} from "@/lib/savedStore";

const KIND_LABEL: Record<SavedKind, string> = {
  correction: "更正",
  rewrite: "完整句",
  reply: "AI 回應",
  vocab: "生字",
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

  const [syncState, setSyncState] = useState<"off" | "idle" | "syncing">("off");

  const stopRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // 雲端同步(有設定先啟用):載入時 pull → merge → push。
  async function doSync(showNote: boolean) {
    setSyncState("syncing");
    try {
      const res = await fetch("/api/sync");
      const data = (await res.json()) as {
        configured?: boolean;
        items?: SavedItem[];
        error?: string;
      };
      if (!data.configured) {
        setSyncState("off");
        return;
      }
      if (data.error) throw new Error(data.error);
      const merged = mergeSaved(getAllSaved(), data.items ?? []);
      replaceAll(merged);
      const push = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: merged }),
      });
      if (!push.ok) throw new Error("上傳雲端失敗");
      setSyncState("idle");
      if (showNote) setNote(`☁ 已同步(共 ${merged.length} 項)`);
    } catch (e) {
      setSyncState("idle");
      setError(e instanceof Error ? e.message : "同步失敗");
    }
  }

  useEffect(() => {
    doSync(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        items: await Promise.all(
          selectedItems.map(async (i) => ({
            text: i.text,
            url: await getCachedCdnUrl(i.text),
          }))
        ),
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
          {syncState !== "off" && (
            <button
              className="ghost-btn"
              onClick={() => doSync(true)}
              disabled={syncState === "syncing"}
              title="同雲端同步"
            >
              {syncState === "syncing" ? "☁ 同步緊…" : "☁ 同步"}
            </button>
          )}
          <Link className="ghost-btn" href="/review" title="今日複習">
            📅 複習
          </Link>
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
                  {it.kind === "vocab" && it.meaning && (
                    <div className="saved-vocab-meaning">
                      {it.meaning}
                      {it.example ? ` — ${it.example}` : ""}
                    </div>
                  )}
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
