/**
 * 密碼保護共用常數(純常數,不 import 任何 runtime crypto,
 * 所以 edge middleware 同 node route 都可以安全 import)。
 *
 * 機制:cookie 儲存的是 sha256(密碼 + salt),而非密碼本身。
 * 即使 cookie 外洩亦無法還原密碼;沒有密碼亦無法偽造有效 cookie。
 */
export const AUTH_COOKIE = "et_auth"; // httpOnly:真正的憑證
export const UI_COOKIE = "et_ui"; // 可讀:僅供前端得知「已登入」以顯示登出按鈕
export const AUTH_SALT = "english-tutor:v1";
