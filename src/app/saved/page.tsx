"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import SpeakerButton from "@/components/SpeakerButton";
import { fetchTtsUrl, getCachedCdnUrl } from "@/lib/tts";
import {
  useSaved,
  removeSaved,
  exportSavedJson,
  importSavedItems,
  getAllSaved,
  mergeSaved,
  mergeTombstones,
  getTombstones,
  replaceAll,
  type SavedItem,
  type SavedKind,
} from "@/lib/savedStore";
import {
  getSyncableConvos,
  getConvoTombstones,
  mergeConvoTombstones,
  mergeInConvos,
} from "@/lib/convoStore";
import { buildBackupJson, restoreBackup, describeRestore } from "@/lib/backup";
import { convosToText, toTextFile } from "@/lib/textExport";

const SORT_KEY = "english-tutor-saved-sort-v1";

const KIND_LABEL: Record<SavedKind, string> = {
  correction: "Correction",
  rewrite: "Full sentence",
  reply: "AI reply",
  vocab: "Word",
};

function fmt(ts: number): string {
  return new Date(ts).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
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
  // 排序方向:false = 最新在前(預設),true = 最舊在前。記住用戶的選擇。
  const [oldestFirst, setOldestFirst] = useState(false);

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
        tombstones?: Record<string, number>;
        convos?: unknown[];
        convoTombstones?: Record<string, number>;
        error?: string;
      };
      if (!data.configured) {
        setSyncState("off");
        return;
      }
      if (data.error) throw new Error(data.error);
      // 先合併兩邊的刪除記錄,再 merge —— 這樣本機刪除的項目不會由雲端復原。
      mergeTombstones(data.tombstones);
      const tombs = getTombstones();
      const merged = mergeSaved(getAllSaved(), data.items ?? [], tombs);
      replaceAll(merged);

      // 對話同樣要同步(逐個對話 last-write-wins)。
      mergeConvoTombstones(data.convoTombstones);
      const pulled = mergeInConvos(data.convos);
      const convoTombs = getConvoTombstones();
      const convos = getSyncableConvos();

      const push = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: merged,
          tombstones: tombs,
          convos,
          convoTombstones: convoTombs,
        }),
      });
      if (!push.ok) throw new Error("Failed to upload to the cloud");
      const pushed = (await push.json().catch(() => ({}))) as { warning?: string };
      setSyncState("idle");
      if (pushed.warning) setError(pushed.warning);
      if (showNote) {
        setNote(
          `☁ Synced — ${merged.length} saved item${merged.length === 1 ? "" : "s"}, ` +
            `${convos.length} conversation${convos.length === 1 ? "" : "s"}` +
            (pulled > 0 ? ` (${pulled} updated from another device)` : "")
        );
      }
    } catch (e) {
      setSyncState("idle");
      setError(e instanceof Error ? e.message : "Sync failed");
    }
  }

  useEffect(() => {
    doSync(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 還原排序偏好(只做一次)
  useEffect(() => {
    try {
      setOldestFirst(localStorage.getItem(SORT_KEY) === "asc");
    } catch {
      /* ignore */
    }
  }, []);

  function toggleSort() {
    setOldestFirst((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SORT_KEY, next ? "asc" : "desc");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function download(content: BlobPart, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function backupJson() {
    // 備份連對話一齊帶走(組裝邏輯在 lib/backup.ts,有測試覆蓋)。
    download(buildBackupJson(), `saved-backup-${Date.now()}.json`, "application/json");
  }

  /** 匯出對話成純文字:給人閱讀/列印,不是給程式讀的備份。 */
  function exportChatsText() {
    const convos = getSyncableConvos(Infinity);
    if (convos.length === 0) {
      setError("No conversations to export yet.");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    download(
      toTextFile(convosToText(convos)),
      `english-tutor-chats-${stamp}.txt`,
      "text/plain;charset=utf-8"
    );
    setNote(
      `Exported ${convos.length} conversation${convos.length === 1 ? "" : "s"} as text`
    );
  }

  async function importBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setNote(null);
    try {
      // 舊備份(v1 純陣列 / v2 冇 convos)一樣讀得,見 lib/backup.ts。
      setNote(describeRestore(restoreBackup(JSON.parse(await file.text()))));
    } catch {
      setError("Import failed: unrecognised file format");
    }
  }

  // savedStore 一律以 savedAt 由新到舊排好;這裡按用戶選擇再排一次。
  const view = useMemo(
    () =>
      [...items].sort((a, b) =>
        oldestFirst ? a.savedAt - b.savedAt : b.savedAt - a.savedAt
      ),
    [items, oldestFirst]
  );

  const allSelected = items.length > 0 && selected.size === items.length;
  // 跟顯示次序,播放同匯出 MP3 的順序才符合預期。
  const selectedItems = view.filter((i) => selected.has(i.id));

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
        /* 跳過無法處理的句子 */
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
        throw new Error(e.error || `Export failed (${res.status})`);
      }
      const included = Number(res.headers.get("x-included") ?? 0);
      const missing = Number(res.headers.get("x-missing") ?? 0);
      const timedOut = res.headers.get("x-timed-out") === "true";
      download(await res.blob(), `review-${Date.now()}.mp3`, "audio/mpeg");
      if (missing > 0) {
        setError(
          `⚠️ The MP3 has ${included} of ${included + missing} sentences — ${missing} could not be generated${
            timedOut ? " (ran out of time)" : ""
          }. Try exporting fewer at a time.`
        );
      } else {
        setNote(`MP3 downloaded (${included} sentences)`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>★ Saved</h1>
        <div className="controls">
          {syncState !== "off" && (
            <button
              className="ghost-btn"
              onClick={() => doSync(true)}
              disabled={syncState === "syncing"}
              title="Sync with the cloud"
            >
              {syncState === "syncing" ? "☁ Syncing…" : "☁ Sync"}
            </button>
          )}
          <Link className="ghost-btn" href="/review" title="Today's review">
            📅 Review
          </Link>
          <button className="ghost-btn" onClick={backupJson} title="Download a backup file">
            ⬇ Back up
          </button>
          <button
            className="ghost-btn"
            onClick={exportChatsText}
            title="Download conversations as a readable text file"
          >
            ⬇ Text
          </button>
          <button
            className="ghost-btn"
            onClick={() => fileRef.current?.click()}
            title="Import from a backup file"
          >
            ⬆ Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={importBackup}
          />
          <Link className="ghost-btn" href="/">
            ← Back
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
            Nothing saved yet 😌
            <br />
            Tap the ☆ beside any sentence while chatting and it will appear here for review.
          </div>
        </div>
      ) : (
        <>
          <div className="saved-toolbar">
            <button className="ghost-btn" onClick={toggleAll}>
              {allSelected ? "Clear selection" : "Select all"}
            </button>
            <button
              className="ghost-btn"
              onClick={toggleSort}
              title={
                oldestFirst
                  ? "Sorted oldest first — tap for newest first"
                  : "Sorted newest first — tap for oldest first"
              }
            >
              {oldestFirst ? "↑ Oldest first" : "↓ Newest first"}
            </button>
            <span className="saved-count">{selected.size} of {items.length} selected</span>
            <div className="saved-toolbar-right">
              {playing ? (
                <button className="ghost-btn" onClick={stopPlay}>
                  ⏹ Stop
                </button>
              ) : (
                <button
                  className="ghost-btn"
                  onClick={() => playList(selectedItems)}
                  disabled={selected.size === 0}
                >
                  ▶ Play selected
                </button>
              )}
              <button
                className="primary-btn"
                onClick={exportMp3}
                disabled={selected.size === 0 || exporting}
              >
                {exporting ? "Exporting…" : "⬇ Download MP3"}
              </button>
            </div>
          </div>

          <div className="messages saved-list">
            {view.map((it) => (
              <div className="saved-row" key={it.id}>
                <input
                  type="checkbox"
                  checked={selected.has(it.id)}
                  onChange={() => toggle(it.id)}
                  aria-label={`Select "${it.text.slice(0, 30)}"`}
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
                  <SpeakerButton text={it.text} title="Read aloud" />
                  <button
                    className="saver"
                    onClick={() => removeSaved(it.id)}
                    title="Delete"
                    aria-label="Delete"
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
