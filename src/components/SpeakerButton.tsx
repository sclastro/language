"use client";

import { useRef, useState } from "react";

// 用文字做 key cache 音訊 URL,再撳同一句就唔使再生成(慳 points)。
const urlCache = new Map<string, string>();

type State = "idle" | "loading" | "playing" | "error";

export default function SpeakerButton({
  text,
  title = "讀出來",
}: {
  text: string;
  title?: string;
}) {
  const [state, setState] = useState<State>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function play() {
    if (state === "loading") return;

    // 已經喺度播 → 停。
    if (state === "playing" && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setState("idle");
      return;
    }

    try {
      let url = urlCache.get(text);
      if (!url) {
        setState("loading");
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) throw new Error(data.error || "TTS failed");
        url = data.url;
        urlCache.set(text, url);
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setState("idle");
      audio.onerror = () => setState("error");
      setState("playing");
      await audio.play();
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }

  const icon =
    state === "loading" ? "…" : state === "playing" ? "⏸" : state === "error" ? "⚠️" : "🔊";

  return (
    <button
      type="button"
      className="speaker"
      onClick={play}
      title={title}
      aria-label={title}
      disabled={state === "loading"}
    >
      {icon}
    </button>
  );
}
