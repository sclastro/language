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

export { AVAILABLE_MODELS } from "./models";

let client: OpenAI | null = null;

/** Lazy 初始化,避免 build 時(未有 key)就爆錯。 */
export function getPoeClient(): OpenAI {
  const apiKey = process.env.POE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "未設定 POE_API_KEY。請將 .env.local.example 複製做 .env.local 並填入你嘅 Poe key。"
    );
  }
  if (!client) {
    client = new OpenAI({ apiKey, baseURL: POE_BASE_URL });
  }
  return client;
}
