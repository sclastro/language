"use client";

import { getAudioRecord, putAudioRecord } from "./audioCache";
import { addUsage } from "./usage";

/**
 * TTS 三層快取:記憶體 → IndexedDB(本機永久)→ 網絡(最後才消耗 points)。
 * 回傳可直接交給 <audio> 播放的 object URL。
 */
const memUrl = new Map<string, string>(); // text -> object URL
const memCdn = new Map<string, string>(); // text -> poecdn URL(匯出用)

/**
 * 全 app 只有一個「正在播放」的音訊 —— 按下第二個喇叭會停止前一個,
 * 不會兩段聲音重疊播放。
 */
let currentAudio: HTMLAudioElement | null = null;

/* ── 朗讀速度 ─────────────────────────────────────────
   放慢對聽清楚每個音很有幫助。這是全 app 共用的設定,所以在這裡集中管理,
   凡經 playExclusive 播放的都會套用。
   ⚠️ 只影響 app 內播放:匯出的 MP3 是檔案,速度已經固定在音訊裡,
   要改就要重新編碼,做不到。 */
const RATE_KEY = "english-tutor-speech-rate-v1";
export const SPEECH_RATES = [0.7, 0.8, 0.9, 1, 1.2] as const;

let speechRate = 1;
let rateLoaded = false;

export function getSpeechRate(): number {
  if (!rateLoaded) {
    rateLoaded = true;
    try {
      const v = Number(localStorage.getItem(RATE_KEY));
      if (v > 0) speechRate = v;
    } catch {
      /* ignore */
    }
  }
  return speechRate;
}

export function setSpeechRate(rate: number) {
  speechRate = rate;
  rateLoaded = true;
  try {
    localStorage.setItem(RATE_KEY, String(rate));
  } catch {
    /* ignore */
  }
  // 正在播的立即跟隨,不用等下一句
  if (currentAudio) currentAudio.playbackRate = rate;
}

export function playExclusive(audio: HTMLAudioElement) {
  if (currentAudio && currentAudio !== audio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
  currentAudio = audio;
  audio.playbackRate = getSpeechRate();
  return audio.play();
}

export function stopCurrent() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}

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
  putAudioRecord(key, blob, cdnUrl); // 背景寫入,不阻礙播放
  return obj;
}
