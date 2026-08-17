/**
 * Client-safe 的模型清單及預設值(不會 import OpenAI SDK 或存取 server env),
 * 所以前端 client component 可以安全 import。
 */

/**
 * 可在 UI 切換的模型清單。ID 須與 Poe /v1/models 一致(全部小寫)。
 * 注意:Poe 手機 app 的新 model(例如 GPT-5.6)未必已上架 API;
 * 此處只列出 /v1/models 確實支援的名稱。gpt-5.4-pro 為 API 目前最強的 GPT。
 */
export const AVAILABLE_MODELS = [
  "claude-opus-4.8",
  "claude-sonnet-4.6",
  "gpt-5.4-pro",
  "gemini-3.1-pro",
] as const;

/** 前端顯示用的預設值(實際生效的預設由 server 端 POE_MODEL env 決定)。 */
export const CLIENT_DEFAULT_MODEL: (typeof AVAILABLE_MODELS)[number] =
  "claude-opus-4.8";
