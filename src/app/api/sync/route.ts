import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * 雲端同步(可選):用 Upstash Redis REST(Vercel Marketplace 一鍵加,
 * 會自動注入 KV_REST_API_URL / KV_REST_API_TOKEN 或 UPSTASH_REDIS_REST_URL / _TOKEN)。
 * 未設定嘅話回 { configured: false },前端就唔顯示同步掣 — app 照用。
 */
const SYNC_KEY = "et:saved";

function kvEnv(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function kvCommand(cmd: unknown[]): Promise<unknown> {
  const kv = kvEnv();
  if (!kv) throw new Error("not configured");
  const res = await fetch(kv.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kv.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KV ${res.status}`);
  const data = (await res.json()) as { result?: unknown };
  return data.result;
}

export async function GET() {
  if (!kvEnv()) return NextResponse.json({ configured: false });
  try {
    const result = await kvCommand(["GET", SYNC_KEY]);
    const items = typeof result === "string" ? JSON.parse(result) : [];
    return NextResponse.json({ configured: true, items: Array.isArray(items) ? items : [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "讀取雲端失敗。";
    return NextResponse.json({ configured: true, error: message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!kvEnv()) {
    return NextResponse.json({ error: "未設定雲端同步。" }, { status: 400 });
  }
  try {
    const body = (await request.json()) as { items?: unknown[] };
    const items = Array.isArray(body.items) ? body.items : [];
    await kvCommand(["SET", SYNC_KEY, JSON.stringify(items)]);
    return NextResponse.json({ ok: true, count: items.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "寫入雲端失敗。";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
