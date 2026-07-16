/**
 * 密碼保護共用常數(純常數,冇 import 任何 runtime crypto,
 * 所以 edge middleware 同 node route 都可以安全 import)。
 *
 * 機制:cookie 存嘅係 sha256(密碼 + salt),唔係密碼本身。
 * 就算 cookie 洩漏都攞唔返密碼;冇密碼亦砌唔到有效 cookie。
 */
export const AUTH_COOKIE = "et_auth"; // httpOnly:真正嘅憑證
export const UI_COOKIE = "et_ui"; // 可讀:淨係俾前端知「已登入」去顯示登出掣
export const AUTH_SALT = "english-tutor:v1";
