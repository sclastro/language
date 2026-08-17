"use client";

import { useCallback, useRef, useState } from "react";
import { addUsage } from "@/lib/usage";

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

type Options = {
  onResult: (text: string) => void;
  onError?: (message: string) => void;
};

/**
 * 麥克風錄音 → 送去 /api/stt(whisper)→ 回文字。
 * 跨平台(iOS/Android/desktop 均可,因為轉錄在 server 端進行,不依賴瀏覽器語音)。
 */
export function useRecorder({ onResult, onError }: Options) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof MediaRecorder !== "undefined";

  const start = useCallback(async () => {
    if (!supported) {
      onError?.("This browser does not support recording.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size === 0) return;
        try {
          setTranscribing(true);
          const dataUrl = await blobToDataUrl(blob);
          const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
          const res = await fetch("/api/stt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: dataUrl, filename: `speech.${ext}` }),
          });
          const data = (await res.json()) as { text?: string; error?: string };
          if (!res.ok) throw new Error(data.error || "Transcription failed");
          addUsage({ stt: 1 });
          if (data.text) onResult(data.text);
          else onError?.("Could not hear anything. Please try again.");
        } catch (e) {
          onError?.(e instanceof Error ? e.message : "Transcription failed.");
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      onError?.("Could not get microphone permission.");
    }
  }, [supported, onResult, onError]);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  return { recording, transcribing, supported, start, stop };
}
