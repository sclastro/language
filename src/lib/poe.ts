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

/**
 * 將 Poe/OpenAI SDK 拋出嘅原始英文錯誤,轉成用戶睇得明嘅中文。
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
      message: "Poe API key 唔正確或者已經作廢。請喺 Vercel 更新 QM_POE9_KEY 再重新部署。",
      status: 401,
    };
  }
  if (status === 429 || /rate limit/i.test(raw)) {
    return { message: "太密集喇,請等一陣再試(Poe 限速)。", status: 429 };
  }
  if (/insufficient|points|quota|billing/i.test(raw)) {
    return { message: "Poe points 唔夠用喇,請睇下你嘅額度。", status: 402 };
  }
  if (/not found/i.test(raw) && /model/i.test(raw)) {
    return { message: "揀咗嘅模型喺 Poe API 度搵唔到,請換另一個。", status: 404 };
  }
  if (status === 408 || /timeout|ETIMEDOUT|aborted/i.test(raw)) {
    return { message: "等太耐 timeout 咗,請再試一次。", status: 504 };
  }
  return { message: raw || "出咗啲問題,請再試。", status };
}
