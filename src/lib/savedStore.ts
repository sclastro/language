import { useSyncExternalStore } from "react";

export type SavedKind = "correction" | "rewrite" | "reply";

export type SavedItem = {
  id: string;
  text: string;
  kind: SavedKind;
  savedAt: number; // Date.now()
};

const KEY = "english-tutor-saved-v1";

let items: SavedItem[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const serverSnapshot: SavedItem[] = [];

function load() {
  if (loaded) return;
  loaded = true;
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(KEY);
      if (raw) items = JSON.parse(raw) as SavedItem[];
    }
  } catch {
    /* 壞資料就當空 */
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* 容量滿就算 */
  }
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function snapshot() {
  return items;
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function addSaved(text: string, kind: SavedKind) {
  load();
  const t = text.trim();
  if (!t) return;
  if (items.some((i) => i.text === t)) return; // 去重
  items = [{ id: newId(), text: t, kind, savedAt: Date.now() }, ...items];
  persist();
  emit();
}

export function removeSaved(id: string) {
  items = items.filter((i) => i.id !== id);
  persist();
  emit();
}

export function removeSavedByText(text: string) {
  const t = text.trim();
  items = items.filter((i) => i.text !== t);
  persist();
  emit();
}

export function toggleSavedByText(text: string, kind: SavedKind) {
  load();
  const t = text.trim();
  if (items.some((i) => i.text === t)) removeSavedByText(t);
  else addSaved(t, kind);
}

/** 匯出成 JSON 字串(俾用戶備份落手機)。 */
export function exportSavedJson(): string {
  load();
  return JSON.stringify({ version: 1, exportedAt: Date.now(), items }, null, 2);
}

/** 由備份匯入,按文字去重合併;回傳實際新增咗幾多句。 */
export function importSavedItems(incoming: unknown): number {
  load();
  const arr = Array.isArray(incoming) ? incoming : [];
  const seen = new Set(items.map((i) => i.text));
  const merged = [...items];
  let added = 0;
  for (const raw of arr) {
    const it = raw as Partial<SavedItem>;
    if (!it || typeof it.text !== "string") continue;
    const t = it.text.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    const kind: SavedKind =
      it.kind === "correction" || it.kind === "rewrite" || it.kind === "reply"
        ? it.kind
        : "reply";
    merged.push({
      id: newId(),
      text: t,
      kind,
      savedAt: typeof it.savedAt === "number" ? it.savedAt : Date.now(),
    });
    added++;
  }
  if (added > 0) {
    merged.sort((a, b) => b.savedAt - a.savedAt);
    items = merged;
    persist();
    emit();
  }
  return added;
}

/** 叫瀏覽器將本站儲存設為「持久」,減低被自動清走嘅機會。 */
export async function requestPersistentStorage() {
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {
    /* 唔支援就算 */
  }
}

/** React hook:訂閱收藏清單(跨組件即時更新)。 */
export function useSaved() {
  load();
  const list = useSyncExternalStore(subscribe, snapshot, () => serverSnapshot);
  return { items: list };
}
