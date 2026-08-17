import OpenAI from "openai";
import { CLIENT_DEFAULT_MODEL } from "./models";

/**
 * Poe 提供 OpenAI-compatible endpoint,所以直接用 openai SDK,
 * 只需更換 baseURL 及 apiKey。key 由 server 端 env 讀取,永遠不會傳到 browser。
 * https://creator.poe.com/docs/external-applications/openai-compatible-api
 *
 * 注意:此檔案只可在 server 端(API route)使用,不要 import 至 client component。
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
  // 支援 QM_POE9_KEY(用戶在 Vercel 使用的名稱),亦保留 POE_API_KEY 作後備。
  const apiKey = process.env.QM_POE9_KEY || process.env.POE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "QM_POE9_KEY (or POE_API_KEY) is not set. Add your Poe key to the environment variables."
    );
  }
  if (!client) {
    client = new OpenAI({ apiKey, baseURL: POE_BASE_URL });
  }
  return client;
}

/**
 * 將 Poe/OpenAI SDK 拋出的原始英文錯誤,轉換成用戶看得明白的中文。
 * 回 { message, status },直接可以放入 NextResponse.json。
 */
export function friendlyError(err: unknown): { message: string; status: number } {
  const status =
    typeof (err as { status?: number })?.status === "number"
      ? (err as { status: number }).status
      : 500;
  const raw = err instanceof Error ? err.message : String(err);

  if (status === 401 || /invalid_api_key|Incorrect API key/i.test(raw)) {
    return {
      message: "Your Poe API key is invalid or has been revoked. Update QM_POE9_KEY in Vercel and redeploy.",
      status: 401,
    };
  }
  if (status === 429 || /rate limit/i.test(raw)) {
    return { message: "Too many requests — please wait a moment (Poe rate limit).", status: 429 };
  }
  if (/insufficient|points|quota|billing/i.test(raw)) {
    return { message: "You are out of Poe points. Check your quota.", status: 402 };
  }
  if (/not found/i.test(raw) && /model/i.test(raw)) {
    return { message: "That model is not available on the Poe API. Pick a different one.", status: 404 };
  }
  if (status === 408 || /timeout|ETIMEDOUT|aborted/i.test(raw)) {
    return { message: "The request timed out. Please try again.", status: 504 };
  }
  return { message: raw || "Something went wrong. Please try again.", status };
}
