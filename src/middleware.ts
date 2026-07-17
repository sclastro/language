import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, AUTH_SALT } from "@/lib/authShared";

// 用 Web Crypto(edge runtime)計 sha256(密碼 + salt),要同 login route 一致。
async function token(pw: string): Promise<string> {
  const data = new TextEncoder().encode(pw + AUTH_SALT);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 定長字串常數時間比較。
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function middleware(req: NextRequest) {
  const pw = process.env.APP_PASSWORD;
  // 冇設定密碼 = 唔啟用保護。
  if (!pw) return NextResponse.next();

  const cookie = req.cookies.get(AUTH_COOKIE)?.value ?? "";
  const authed = safeEqual(cookie, await token(pw));
  const { pathname } = req.nextUrl;

  if (authed) {
    if (pathname === "/login") return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }

  // 未登入
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "需要登入。" }, { status: 401 });
  }
  if (pathname === "/login") return NextResponse.next();
  return NextResponse.redirect(new URL("/login", req.url));
}

// 只保護頁面同貴嘅 API;登入/登出 API、靜態資源、PWA icon 唔喺度。
export const config = {
  matcher: [
    "/",
    "/login",
    "/saved",
    "/api/chat",
    "/api/tts",
    "/api/stt",
    "/api/export",
  ],
};
