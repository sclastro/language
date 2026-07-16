import { NextResponse } from "next/server";
import { AUTH_COOKIE, UI_COOKIE } from "@/lib/authShared";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(UI_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
