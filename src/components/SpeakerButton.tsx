"use client";

import { useEffect, useRef, useState } from "react";
import { fetchTtsUrl, playExclusive, stopCurrent } from "@/lib/tts";

type State = "idle" | "loading" | "playing" | "error";

export default function SpeakerButton({
  text,
  title = "Read aloud",
}: {
  text: string;
  title?: string;
}) {
  const [state, setState] = useState<State>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 離開頁面/組件時停止,避免聲音繼續播放。
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio) {
        audio.pause();
        audio.onended = null;
        audio.onerror = null;
        audio.onpause = null;
      }
    };
  }, []);

  async function play() {
    if (state === "loading") return;

    // 正在播放 → 停止。
    if (state === "playing" && audioRef.current) {
      stopCurrent();
      setState("idle");
      return;
    }

    try {
      setState("loading");
      const url = await fetchTtsUrl(text);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setState("idle");
      audio.onerror = () => setState("error");
      // 被其他喇叭按鈕搶播而停止時,本按鈕的圖示亦需一併還原。
      audio.onpause = () => setState((s) => (s === "playing" ? "idle" : s));
      setState("playing");
      await playExclusive(audio);
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
