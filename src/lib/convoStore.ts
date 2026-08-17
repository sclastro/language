"use client";

import { useSyncExternalStore } from "react";
import type { Correction } from "./types";
import type { ScenarioId } from "./scenarios";

/** 一則對話:用戶的句子會附帶 AI 提供的糾正。 */
export type UserItem = {
  kind: "user";
  content: string;
  corrections?: Correction[];
  rewrite?: string;
};
export type AssistantItem = { kind: "assistant"; content: string };
export type ChatItem = UserItem | AssistantItem;

export type Convo = {
  id: string;
  title: string;
  scenario: ScenarioId;
  items: ChatItem[];
  createdAt: number;
  updatedAt: number;
};

type State = { convos: Convo[]; activeId: string };

const KEY = "english-tutor-convos-v1";
const LEGACY_KEY = "english-tutor-state-v1";
const TOMB_KEY = "english-tutor-convos-deleted-v1";

/** 同步時最多帶多少個對話,避免 payload 無限膨脹(取最近更新的)。 */
export const MAX_SYNCED_CONVOS = 30;

/** 刪除記錄:對話 id → 刪除時間。沒有它的話,同步會把已刪除的對話拉回來。 */
export type ConvoTombstones = Record<string, number>;

let state: State | null = null;
let convoTombs: ConvoTombstones = {};
const listeners = new Set<() => void>();
const serverState: State = { convos: [], activeId: "" };

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function blankConvo(scenario: ScenarioId = "free"): Convo {
  const now = Date.now();
  return { id: newId(), title: "New chat", scenario, items: [], createdAt: now, updatedAt: now };
}

function load(): State {
  if (state) return state;
  try {
    const tomb = localStorage.getItem(TOMB_KEY);
    if (tomb) convoTombs = JSON.parse(tomb) as ConvoTombstones;
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      state = JSON.parse(raw) as State;
      if (state.convos.length > 0) return state;
    }
  } catch {
    /* fallthrough */
  }
  // 由舊版單一對話遷移
  let migrated: ChatItem[] = [];
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const s = JSON.parse(legacy) as { items?: ChatItem[] };
      if (Array.isArray(s.items)) migrated = s.items;
    }
  } catch {
    /* ignore */
  }
  const first = blankConvo();
  first.items = migrated;
  if (migrated.length > 0) first.title = titleFrom(migrated);
  state = { convos: [first], activeId: first.id };
  persist();
  return state;
}

function titleFrom(items: ChatItem[]): string {
  const firstUser = items.find((i) => i.kind === "user");
  return firstUser ? firstUser.content.slice(0, 24) : "New chat";
}

function persist() {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(TOMB_KEY, JSON.stringify(convoTombs));
  } catch {
    /* ignore */
  }
}

function emit() {
  state = state ? { ...state } : state; // 新 reference 令 useSyncExternalStore 更新
  persist();
  listeners.forEach((l) => l());
}

export function getActive(): Convo {
  const s = load();
  return s.convos.find((c) => c.id === s.activeId) ?? s.convos[0];
}

export function setActive(id: string) {
  const s = load();
  if (s.convos.some((c) => c.id === id)) {
    s.activeId = id;
    emit();
  }
}

export function newConvo(scenario: ScenarioId = "free"): string {
  const s = load();
  const c = blankConvo(scenario);
  s.convos = [c, ...s.convos];
  s.activeId = c.id;
  emit();
  return c.id;
}

export function deleteConvo(id: string) {
  const s = load();
  convoTombs[id] = Date.now(); // 記低,否則同步會由雲端拉返落嚟
  s.convos = s.convos.filter((c) => c.id !== id);
  if (s.convos.length === 0) s.convos = [blankConvo()];
  if (!s.convos.some((c) => c.id === s.activeId)) s.activeId = s.convos[0].id;
  emit();
}

export function setScenario(id: string, scenario: ScenarioId) {
  const s = load();
  const c = s.convos.find((x) => x.id === id);
  if (c) {
    c.scenario = scenario;
    c.updatedAt = Date.now();
    emit();
  }
}

/** 更新使用中對話的訊息(updater 接收現有 items,回傳新 items)。 */
export function updateActiveItems(updater: (items: ChatItem[]) => ChatItem[]) {
  const s = load();
  const c = s.convos.find((x) => x.id === s.activeId);
  if (!c) return;
  c.items = updater(c.items);
  c.updatedAt = Date.now();
  if (c.title === "New chat") c.title = titleFrom(c.items);
  emit();
}

/* ── 備份 / 雲端同步 ───────────────────────────────────────────
   對話同收藏唔同:一段對話係一個整體,兩部機各自加咗訊息就無法可靠地
   逐句合併(次序、糾正掛喺邊句都會亂)。所以策略係**逐個對話** last-write-wins:
   同一個 id 就取 updatedAt 較新嗰個。空白對話唔會同步,否則每部機開機
   都會產生一個「New chat」垃圾。 */

/** 值得帶走的對話(有內容、最近更新優先、有數量上限)。 */
export function getSyncableConvos(limit = MAX_SYNCED_CONVOS): Convo[] {
  const s = load();
  return s.convos
    .filter((c) => c.items.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

export function getConvoTombstones(): ConvoTombstones {
  load();
  return convoTombs;
}

export function mergeConvoTombstones(remote: ConvoTombstones | undefined) {
  load();
  if (!remote) return;
  for (const [k, v] of Object.entries(remote)) {
    if (typeof v === "number" && v > (convoTombs[k] ?? 0)) convoTombs[k] = v;
  }
  persist();
}

function isConvo(c: unknown): c is Convo {
  const x = c as Partial<Convo>;
  return (
    !!x &&
    typeof x.id === "string" &&
    Array.isArray(x.items) &&
    typeof x.updatedAt === "number"
  );
}

/** 依 id 合併兩批對話:updatedAt 較新者勝;`tombs` 內(刪除時間晚於 updatedAt)剔除。 */
export function mergeConvos(
  a: Convo[],
  b: Convo[],
  tombs: ConvoTombstones = {}
): Convo[] {
  const byId = new Map<string, Convo>();
  for (const c of [...a, ...b]) {
    if (!isConvo(c)) continue;
    const prev = byId.get(c.id);
    if (!prev || c.updatedAt > prev.updatedAt) byId.set(c.id, c);
  }
  return [...byId.values()]
    .filter((c) => {
      const deletedAt = tombs[c.id];
      return deletedAt === undefined || deletedAt < c.updatedAt;
    })
    .sort((x, y) => y.updatedAt - x.updatedAt);
}

/**
 * 合併一批外來對話入本機(同步/匯入用);回傳實際變動咗幾多個對話。
 *
 * ⚠️ 唔可以喺 incoming 為空時就早退:另一部機刪咗對話之後,雲端會回一個
 * **空的 convos 清單加一條刪除記錄**。早退的話,本機嗰份副本永遠唔會被清走,
 * 對話就會「翻生」。所以無論有冇 incoming,都要用最新的 tombstones 過濾一次。
 */
export function mergeInConvos(incoming: unknown): number {
  const s = load();
  const arr = Array.isArray(incoming) ? incoming.filter(isConvo) : [];

  const before = new Map(s.convos.map((c) => [c.id, c.updatedAt]));
  const merged = mergeConvos(s.convos, arr, convoTombs);

  // 新增/更新
  let changed = 0;
  for (const c of merged) {
    if (before.get(c.id) !== c.updatedAt) changed++;
  }
  // 被刪除記錄剔走的(本機有、合併後冇)
  const keptIds = new Set(merged.map((c) => c.id));
  for (const id of before.keys()) {
    if (!keptIds.has(id)) changed++;
  }
  if (changed === 0) return 0;

  s.convos = merged.length > 0 ? merged : [blankConvo()];
  if (!s.convos.some((c) => c.id === s.activeId)) s.activeId = s.convos[0].id;
  emit();
  return changed;
}

export function useConvos(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (typeof window === "undefined" ? serverState : load()),
    () => serverState
  );
}
