/**
 * Client-safe 嘅模型清單同預設值(唔會 import OpenAI SDK 或者掂 server env),
 * 所以前端 client component 可以安全 import。
 */

/**
 * 可以喺 UI 切換嘅模型清單。ID 要同 Poe /v1/models 一致(全部細楷)。
 * 由平到貴大約:gemini-3.1-pro < gpt-5.4 < claude-sonnet-4.6 < claude-opus-4.8。
 */
export const AVAILABLE_MODELS = [
  "claude-opus-4.8",
  "claude-sonnet-4.6",
  "gpt-5.4",
  "gemini-3.1-pro",
] as const;

/** 前端顯示用嘅預設(真正生效嘅預設由 server 端 POE_MODEL env 決定)。 */
export const CLIENT_DEFAULT_MODEL: (typeof AVAILABLE_MODELS)[number] =
  "claude-opus-4.8";
