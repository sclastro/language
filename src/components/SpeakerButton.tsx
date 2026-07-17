"use client";

import { useRef, useState } from "react";
import { fetchTtsUrl } from "@/lib/tts";

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
      setState("loading");
      const url = await fetchTtsUrl(text);
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
