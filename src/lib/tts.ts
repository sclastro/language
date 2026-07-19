"use client";

import { getAudioRecord, putAudioRecord } from "./audioCache";
import { addUsage } from "./usage";

/**
 * TTS 三層快取:記憶體 → IndexedDB(本機永久)→ 網絡(先至燒 points)。
 * 回傳可以直接俾 <audio> 播嘅 object URL。
 */
const memUrl = new Map<string, string>(); // text -> object URL
const memCdn = new Map<string, string>(); // text -> poecdn URL(匯出用)

export function getCachedTtsUrl(text: string): string | undefined {
  return memCdn.get(text.trim());
}

export async function getCachedCdnUrl(text: string): Promise<string | undefined> {
  const key = text.trim();
  const hit = memCdn.get(key);
  if (hit) return hit;
  const rec = await getAudioRecord(key);
  if (rec?.cdnUrl) {
    memCdn.set(key, rec.cdnUrl);
    return rec.cdnUrl;
  }
  return undefined;
}

export async function fetchTtsUrl(text: string): Promise<string> {
  const key = text.trim();
  const cached = memUrl.get(key);
  if (cached) return cached;

  // IndexedDB 有就直接用本機音訊
  const rec = await getAudioRecord(key);
  if (rec?.blob) {
    const obj = URL.createObjectURL(rec.blob);
    memUrl.set(key, obj);
    if (rec.cdnUrl) memCdn.set(key, rec.cdnUrl);
    return obj;
  }

  // 網絡生成(raw 模式:server 直接回音訊 bytes + header 帶 cdn URL)
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: key, raw: true }),
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error || "TTS failed");
  }
  const cdnUrl = res.headers.get("x-audio-url") || "";
  const blob = await res.blob();
  addUsage({ tts: 1 });

  const obj = URL.createObjectURL(blob);
  memUrl.set(key, obj);
  if (cdnUrl) memCdn.set(key, cdnUrl);
  putAudioRecord(key, blob, cdnUrl); // 背景寫入,唔阻播放
  return obj;
}
