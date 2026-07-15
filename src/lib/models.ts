/**
 * Client-safe 嘅模型清單同預設值(唔會 import OpenAI SDK 或者掂 server env),
 * 所以前端 client component 可以安全 import。
 */

/**
 * 可以喺 UI 切換嘅模型清單。ID 要同 Poe /v1/models 一致(全部細楷)。
 * 注意:Poe 手機 app 嘅新 model(例如 GPT-5.6)未必已經上到 API;
 * 呢度只放 /v1/models 真係支援嘅名。gpt-5.4-pro 係 API 現時最強嘅 GPT。
 */
export const AVAILABLE_MODELS = [
  "claude-opus-4.8",
  "claude-sonnet-4.6",
  "gpt-5.4-pro",
  "gemini-3.1-pro",
] as const;

/** 前端顯示用嘅預設(真正生效嘅預設由 server 端 POE_MODEL env 決定)。 */
export const CLIENT_DEFAULT_MODEL: (typeof AVAILABLE_MODELS)[number] =
  "claude-opus-4.8";
