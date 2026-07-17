// 共用 TTS 快取:用文字做 key,避免同一句重覆生成(慳 Poe points)。
// SpeakerButton 同「收藏」頁匯出都用呢個。
const cache = new Map<string, string>();

export function getCachedTtsUrl(text: string): string | undefined {
  return cache.get(text.trim());
}

export async function fetchTtsUrl(text: string): Promise<string> {
  const key = text.trim();
  const hit = cache.get(key);
  if (hit) return hit;

  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: key }),
  });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error || "TTS failed");
  cache.set(key, data.url);
  return data.url;
}
