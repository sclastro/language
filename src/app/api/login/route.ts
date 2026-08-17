import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { AUTH_COOKIE, UI_COOKIE, AUTH_SALT } from "@/lib/authShared";

export const runtime = "nodejs";

function token(pw: string): string {
  return crypto.createHash("sha256").update(pw + AUTH_SALT).digest("hex");
}

/**
 * 簡單防爆破:同一 IP 連續打錯就開始限速。
 * 存於記憶體(serverless 有多個 instance,擋不住有決心的攻擊),
 * 但足以令自動化猜密碼變得不划算。
 */
const MAX_FAILS = 8;
const WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map<string, { fails: number; first: number }>();

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

function checkThrottle(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) return true;
  return rec.fails < MAX_FAILS;
}

function noteFail(ip: string) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) attempts.set(ip, { fails: 1, first: now });
  else rec.fails++;
  // 阻止 map 無限脹大
  if (attempts.size > 1000) {
    for (const [k, v] of attempts) {
      if (now - v.first > WINDOW_MS) attempts.delete(k);
    }
  }
}

export async function POST(request: Request) {
  const pw = process.env.APP_PASSWORD;
  // 未設定密碼 = 不啟用保護(例如本機開發)。
  if (!pw) return NextResponse.json({ ok: true, disabled: true });

  const ip = clientIp(request);
  if (!checkThrottle(ip)) {
    return NextResponse.json(
      { error: "嘗試次數過多,請十分鐘後再試。" },
      { status: 429 }
    );
  }

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
    noteFail(ip);
    return NextResponse.json({ error: "密碼不正確。" }, { status: 401 });
  }
  attempts.delete(ip); // 成功登入 → 清除記錄

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
