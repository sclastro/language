"use client";

import { useEffect, useRef, useState } from "react";
import { fetchTtsUrl, playExclusive, stopCurrent } from "@/lib/tts";

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

  // 離開頁面/組件時停低,唔好有把聲繼續播落去。
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

    // 已經喺度播 → 停。
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
      // 俾人撳第二個喇叭而停低時,呢個掣個 icon 都要跟住還原。
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
