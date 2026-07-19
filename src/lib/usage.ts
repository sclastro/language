"use client";

import { useSyncExternalStore } from "react";

/**
 * 用量追蹤(存 browser localStorage,按日累計):
 * chat tokens(伺服器回報或估算)、TTS 次數、STT 次數。
 */
export type DayUsage = { tokens: number; tts: number; stt: number };
type UsageMap = Record<string, DayUsage>; // key = YYYY-MM-DD

const KEY = "english-tutor-usage-v1";

let map: UsageMap = {};
let loaded = false;
let version = 0;
const listeners = new Set<() => void>();

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) map = JSON.parse(raw) as UsageMap;
  } catch {
    /* ignore */
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function dayKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addUsage(delta: Partial<DayUsage>) {
  load();
  const k = dayKey();
  const cur = map[k] ?? { tokens: 0, tts: 0, stt: 0 };
  map[k] = {
    tokens: cur.tokens + (delta.tokens ?? 0),
    tts: cur.tts + (delta.tts ?? 0),
    stt: cur.stt + (delta.stt ?? 0),
  };
  version++;
  persist();
  listeners.forEach((l) => l());
}

export type UsageSummary = { today: DayUsage; month: DayUsage };

let cached: { v: number; s: UsageSummary } | null = null;

function summarize(): UsageSummary {
  load();
  if (cached && cached.v === version) return cached.s;
  const empty = () => ({ tokens: 0, tts: 0, stt: 0 });
  const today = map[dayKey()] ?? empty();
  const prefix = dayKey().slice(0, 7); // YYYY-MM
  const month = empty();
  for (const [k, v] of Object.entries(map)) {
    if (k.startsWith(prefix)) {
      month.tokens += v.tokens;
      month.tts += v.tts;
      month.stt += v.stt;
    }
  }
  cached = { v: version, s: { today, month } };
  return cached.s;
}

const serverSummary: UsageSummary = {
  today: { tokens: 0, tts: 0, stt: 0 },
  month: { tokens: 0, tts: 0, stt: 0 },
};

export function useUsage(): UsageSummary {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    summarize,
    () => serverSummary
  );
}
