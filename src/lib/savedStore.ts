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

/** React hook:訂閱收藏清單(跨組件即時更新)。 */
export function useSaved() {
  load();
  const list = useSyncExternalStore(subscribe, snapshot, () => serverSnapshot);
  return { items: list };
}
