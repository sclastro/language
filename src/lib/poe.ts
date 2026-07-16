import OpenAI from "openai";
import { CLIENT_DEFAULT_MODEL } from "./models";

/**
 * Poe 提供 OpenAI-compatible endpoint,所以直接用 openai SDK,
 * 只需要換 baseURL 同 apiKey。key 由 server 端 env 讀,永遠唔會落到 browser。
 * https://creator.poe.com/docs/external-applications/openai-compatible-api
 *
 * 注意:呢個檔案只可以喺 server 端(API route)用,唔好 import 落 client component。
 */
const POE_BASE_URL = "https://api.poe.com/v1";

export const DEFAULT_MODEL = process.env.POE_MODEL || CLIENT_DEFAULT_MODEL;

/**
 * 語音模型(高質素 AI 語音,經 chat completions 呼叫):
 *  - TTS:elevenlabs-v3 → 回一條 poecdn 音訊 URL(自然人聲)。
 *  - STT:whisper-v3-large-t → 收 base64 音訊 file part,回文字。
 * ⚠️ 兩者都會消耗 Poe points。
 */
export const DEFAULT_TTS_MODEL = process.env.POE_TTS_MODEL || "elevenlabs-v3";
// cartesia-ink-whisper:低延遲串流 ASR,實測 base64 音訊 1–4 秒回,穩定過 whisper-v3。
export const DEFAULT_STT_MODEL = process.env.POE_STT_MODEL || "cartesia-ink-whisper";

export { AVAILABLE_MODELS } from "./models";

let client: OpenAI | null = null;

/** Lazy 初始化,避免 build 時(未有 key)就爆錯。 */
export function getPoeClient(): OpenAI {
  // 支援 QM_POE9_KEY(用戶喺 Vercel 用嘅名),亦保留 POE_API_KEY 做後備。
  const apiKey = process.env.QM_POE9_KEY || process.env.POE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "未設定 QM_POE9_KEY(或 POE_API_KEY)。請喺環境變數填入你嘅 Poe key。"
    );
  }
  if (!client) {
    client = new OpenAI({ apiKey, baseURL: POE_BASE_URL });
  }
  return client;
}
