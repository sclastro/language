import { useSyncExternalStore } from "react";
import { initialSrs, reviewSrs, isDue, type SrsState } from "./srs";

export type SavedKind = "correction" | "rewrite" | "reply" | "vocab";

export type SavedItem = {
  id: string;
  text: string;
  kind: SavedKind;
  savedAt: number; // Date.now()
  srs?: SrsState; // 間隔重複狀態(未設定 = 未複習過,即到期)
  meaning?: string; // 生字:繁中解釋
  example?: string; // 生字:例句
};

const KEY = "english-tutor-saved-v1";
const TOMB_KEY = "english-tutor-deleted-v1";

/** 刪除記錄(tombstone):text → 刪除時間。缺少它的話,同步會把已刪除的項目重新拉回來。 */
export type Tombstones = Record<string, number>;

let items: SavedItem[] = [];
let tombstones: Tombstones = {};
let loaded = false;
const listeners = new Set<() => void>();
const serverSnapshot: SavedItem[] = [];

/** 同一句可在不同類別各存一份(例如「更正」與「生字」);同類別才視為重複。 */
function dedupKey(text: string, kind: SavedKind): string {
  return `${kind} ${text.trim()}`;
}

function load() {
  if (loaded) return;
  loaded = true;
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(KEY);
      if (raw) items = JSON.parse(raw) as SavedItem[];
      const tomb = localStorage.getItem(TOMB_KEY);
      if (tomb) tombstones = JSON.parse(tomb) as Tombstones;
    }
  } catch {
    /* 壞資料就當空 */
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    localStorage.setItem(TOMB_KEY, JSON.stringify(tombstones));
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
  const key = dedupKey(t, kind);
  if (items.some((i) => dedupKey(i.text, i.kind) === key)) return; // 同類別去重
  delete tombstones[key]; // 重新收藏 → 取消刪除記錄
  items = [{ id: newId(), text: t, kind, savedAt: Date.now() }, ...items];
  persist();
  emit();
}

export function removeSaved(id: string) {
  load();
  const gone = items.find((i) => i.id === id);
  if (gone) tombstones[dedupKey(gone.text, gone.kind)] = Date.now();
  items = items.filter((i) => i.id !== id);
  persist();
  emit();
}

export function removeSavedByText(text: string, kind?: SavedKind) {
  load();
  const t = text.trim();
  const match = (i: SavedItem) => i.text === t && (kind === undefined || i.kind === kind);
  for (const i of items.filter(match)) {
    tombstones[dedupKey(i.text, i.kind)] = Date.now();
  }
  items = items.filter((i) => !match(i));
  persist();
  emit();
}

export function toggleSavedByText(text: string, kind: SavedKind) {
  load();
  const key = dedupKey(text, kind);
  if (items.some((i) => dedupKey(i.text, i.kind) === key)) removeSavedByText(text, kind);
  else addSaved(text, kind);
}

/** 加入生字(附中文解釋 + 例句)。 */
export function addVocab(word: string, meaning: string, example: string) {
  load();
  const t = word.trim();
  if (!t) return;
  if (items.some((i) => i.text === t && i.kind === "vocab")) return;
  delete tombstones[dedupKey(t, "vocab")];
  items = [
    { id: newId(), text: t, kind: "vocab", savedAt: Date.now(), meaning, example },
    ...items,
  ];
  persist();
  emit();
}

/** 今日到期需複習的項目(依到期時間由早至遲排序)。 */
export function dueItems(now = Date.now()): SavedItem[] {
  load();
  return items
    .filter((i) => isDue(i.srs, i.savedAt, now))
    .sort((a, b) => (a.srs?.due ?? a.savedAt) - (b.srs?.due ?? b.savedAt));
}

/** 複習一項:記得/忘記 → 更新 SRS 排程。 */
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

/** 用於雲端同步:整份取代(已在外部完成 merge)。 */
export function replaceAll(next: SavedItem[]) {
  load();
  items = [...next].sort((a, b) => b.savedAt - a.savedAt);
  persist();
  emit();
}

/** 取得完整清單(供同步使用)。 */
export function getAllSaved(): SavedItem[] {
  load();
  return items;
}

/**
 * 合併兩份收藏(同類別且同文字視為同一項):保留複習進度較深/較新的一個,
 * 並保住 meaning/example。`tombs` 中(刪除時間晚於該項 savedAt)的項目會被剔除,
 * 這樣已刪除的項目才不會由雲端復原。
 */
export function mergeSaved(
  a: SavedItem[],
  b: SavedItem[],
  tombs: Tombstones = {}
): SavedItem[] {
  const byKey = new Map<string, SavedItem>();
  for (const it of [...a, ...b]) {
    if (!it || typeof it.text !== "string") continue;
    const kind: SavedKind = isKind(it.kind) ? it.kind : "reply";
    const key = dedupKey(it.text, kind);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...it, kind });
      continue;
    }
    const deeper =
      (it.srs?.reps ?? 0) > (prev.srs?.reps ?? 0) ||
      ((it.srs?.reps ?? 0) === (prev.srs?.reps ?? 0) && it.savedAt > prev.savedAt);
    const pick = deeper ? it : prev;
    const other = deeper ? prev : it;
    byKey.set(key, {
      ...pick,
      kind,
      // 補回另一邊有、自己沒有的資料,避免遺失
      meaning: pick.meaning ?? other.meaning,
      example: pick.example ?? other.example,
      srs: pick.srs ?? other.srs,
    });
  }
  return [...byKey.values()]
    .filter((it) => {
      const deletedAt = tombs[dedupKey(it.text, it.kind)];
      return deletedAt === undefined || deletedAt < it.savedAt;
    })
    .sort((x, y) => y.savedAt - x.savedAt);
}

/** 取得刪除記錄(供同步一併上傳)。 */
export function getTombstones(): Tombstones {
  load();
  return tombstones;
}

/** 合併遠端的刪除記錄(每個 key 取最晚的時間)。 */
export function mergeTombstones(remote: Tombstones | undefined) {
  load();
  if (!remote) return;
  for (const [k, v] of Object.entries(remote)) {
    if (typeof v === "number" && v > (tombstones[k] ?? 0)) tombstones[k] = v;
  }
  persist();
}

function isKind(k: unknown): k is SavedKind {
  return k === "correction" || k === "rewrite" || k === "reply" || k === "vocab";
}

/** 匯出成 JSON 字串(供用戶備份至手機);連同刪除記錄一併帶走。 */
export function exportSavedJson(): string {
  load();
  return JSON.stringify(
    { version: 2, exportedAt: Date.now(), items, tombstones },
    null,
    2
  );
}

/**
 * 由備份匯入,同類別且同文字者去重;回傳實際新增的項目數。
 * ⚠️ 一定要保住 srs(複習進度)同 meaning/example(生字解釋),
 * 否則還原之後生字簿會失去所有解釋,SRS 進度亦會歸零。
 */
export function importSavedItems(incoming: unknown): number {
  load();
  const arr = Array.isArray(incoming) ? incoming : [];
  const seen = new Set(items.map((i) => dedupKey(i.text, i.kind)));
  const merged = [...items];
  let added = 0;
  for (const raw of arr) {
    const it = raw as Partial<SavedItem>;
    if (!it || typeof it.text !== "string") continue;
    const t = it.text.trim();
    if (!t) continue;
    const kind: SavedKind = isKind(it.kind) ? it.kind : "reply";
    const key = dedupKey(t, kind);
    if (seen.has(key)) continue;
    seen.add(key);
    delete tombstones[key]; // 明確匯入 → 覆蓋舊的刪除記錄
    merged.push({
      id: newId(),
      text: t,
      kind,
      savedAt: typeof it.savedAt === "number" ? it.savedAt : Date.now(),
      ...(it.srs ? { srs: it.srs } : {}),
      ...(typeof it.meaning === "string" ? { meaning: it.meaning } : {}),
      ...(typeof it.example === "string" ? { example: it.example } : {}),
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

/** 要求瀏覽器將本站儲存設為「持久」,降低被自動清除的機會。 */
export async function requestPersistentStorage() {
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {
    /* 不支援則略過 */
  }
}

/** React hook:訂閱收藏清單(跨組件即時更新)。 */
export function useSaved() {
  load();
  const list = useSyncExternalStore(subscribe, snapshot, () => serverSnapshot);
  return { items: list };
}
