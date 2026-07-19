import { useSyncExternalStore } from "react";
import { initialSrs, reviewSrs, isDue, type SrsState } from "./srs";

export type SavedKind = "correction" | "rewrite" | "reply" | "vocab";

export type SavedItem = {
  id: string;
  text: string;
  kind: SavedKind;
  savedAt: number; // Date.now()
  srs?: SrsState; // 間隔重複狀態(冇 = 未複習過,即到期)
  meaning?: string; // 生字:繁中解釋
  example?: string; // 生字:例句
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

/** 加入生字(附中文解釋 + 例句)。 */
export function addVocab(word: string, meaning: string, example: string) {
  load();
  const t = word.trim();
  if (!t) return;
  if (items.some((i) => i.text === t && i.kind === "vocab")) return;
  items = [
    { id: newId(), text: t, kind: "vocab", savedAt: Date.now(), meaning, example },
    ...items,
  ];
  persist();
  emit();
}

/** 今日到期要複習嘅項目(由最早到期排先)。 */
export function dueItems(now = Date.now()): SavedItem[] {
  load();
  return items
    .filter((i) => isDue(i.srs, i.savedAt, now))
    .sort((a, b) => (a.srs?.due ?? a.savedAt) - (b.srs?.due ?? b.savedAt));
}

/** 複習一項:記得/唔記得 → 更新 SRS 排程。 */
export function reviewItem(id: string, remembered: boolean) {
  load();
  items = items.map((i) =>
    i.id === id
      ? { ...i, srs: reviewSrs(i.srs ?? initialSrs(i.savedAt), remembered) }
      : i
  );
  persist();
  emit();
}

/** 用喺雲端同步:整份取代(已喺外面 merge 好)。 */
export function replaceAll(next: SavedItem[]) {
  load();
  items = [...next].sort((a, b) => b.savedAt - a.savedAt);
  persist();
  emit();
}

/** 攞成份清單(俾同步用)。 */
export function getAllSaved(): SavedItem[] {
  load();
  return items;
}

/** 按 text 合併兩份收藏:保留複習進度較深/較新嗰個。 */
export function mergeSaved(a: SavedItem[], b: SavedItem[]): SavedItem[] {
  const byText = new Map<string, SavedItem>();
  for (const it of [...a, ...b]) {
    if (!it || typeof it.text !== "string") continue;
    const key = it.text.trim();
    const prev = byText.get(key);
    if (!prev) {
      byText.set(key, it);
    } else {
      const pick =
        (it.srs?.reps ?? 0) > (prev.srs?.reps ?? 0) ||
        ((it.srs?.reps ?? 0) === (prev.srs?.reps ?? 0) && it.savedAt > prev.savedAt)
          ? it
          : prev;
      byText.set(key, { ...pick, meaning: pick.meaning ?? prev.meaning ?? it.meaning });
    }
  }
  return [...byText.values()].sort((x, y) => y.savedAt - x.savedAt);
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
