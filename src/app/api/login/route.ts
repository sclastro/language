import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { AUTH_COOKIE, UI_COOKIE, AUTH_SALT } from "@/lib/authShared";

export const runtime = "nodejs";

function token(pw: string): string {
  return crypto.createHash("sha256").update(pw + AUTH_SALT).digest("hex");
}

export async function POST(request: Request) {
  const pw = process.env.APP_PASSWORD;
  // 冇設定密碼 = 唔啟用保護(例如本機開發)。
  if (!pw) return NextResponse.json({ ok: true, disabled: true });

  let password = "";
  try {
    password = String(((await request.json()) as { password?: string }).password ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const expected = token(pw);
  const got = token(password);
  const ok =
    got.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  if (!ok) {
    return NextResponse.json({ error: "密碼唔啱。" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === "production";
  const maxAge = 60 * 60 * 24 * 30; // 30 日
  res.cookies.set(AUTH_COOKIE, expected, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  res.cookies.set(UI_COOKIE, "1", {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return res;
}
