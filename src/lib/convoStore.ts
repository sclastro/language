"use client";

import { useSyncExternalStore } from "react";
import type { Correction } from "./types";
import type { ScenarioId } from "./scenarios";

/** 一格對話:用戶嗰句會夾埋 AI 俾嘅糾正。 */
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

let state: State | null = null;
const listeners = new Set<() => void>();
const serverState: State = { convos: [], activeId: "" };

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function blankConvo(scenario: ScenarioId = "free"): Convo {
  const now = Date.now();
  return { id: newId(), title: "新對話", scenario, items: [], createdAt: now, updatedAt: now };
}

function load(): State {
  if (state) return state;
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
  return firstUser ? firstUser.content.slice(0, 24) : "新對話";
}

function persist() {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
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

/** 更新活躍對話嘅訊息(updater 收現有 items 回新 items)。 */
export function updateActiveItems(updater: (items: ChatItem[]) => ChatItem[]) {
  const s = load();
  const c = s.convos.find((x) => x.id === s.activeId);
  if (!c) return;
  c.items = updater(c.items);
  c.updatedAt = Date.now();
  if (c.title === "新對話") c.title = titleFrom(c.items);
  emit();
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
