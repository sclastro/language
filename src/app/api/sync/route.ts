import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * 雲端同步(可選):用 Upstash Redis REST(Vercel Marketplace 一鍵加,
 * 會自動注入 KV_REST_API_URL / KV_REST_API_TOKEN 或 UPSTASH_REDIS_REST_URL / _TOKEN)。
 * 未設定時回傳 { configured: false },前端便不顯示同步按鈕 — app 仍可正常使用。
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
    const parsed = typeof result === "string" ? JSON.parse(result) : null;
    // v1 儲存的是一個 array;v2 儲存 { items, tombstones }。兩種格式皆可讀取。
    const items = Array.isArray(parsed) ? parsed : (parsed?.items ?? []);
    const tombstones = Array.isArray(parsed) ? {} : (parsed?.tombstones ?? {});
    // v3 起連對話一齊存
    const convos = Array.isArray(parsed) ? [] : (parsed?.convos ?? []);
    const convoTombstones = Array.isArray(parsed) ? {} : (parsed?.convoTombstones ?? {});
    return NextResponse.json({
      configured: true,
      items: Array.isArray(items) ? items : [],
      tombstones: tombstones && typeof tombstones === "object" ? tombstones : {},
      convos: Array.isArray(convos) ? convos : [],
      convoTombstones:
        convoTombstones && typeof convoTombstones === "object" ? convoTombstones : {},
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read from the cloud.";
    return NextResponse.json({ configured: true, error: message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!kvEnv()) {
    return NextResponse.json({ error: "Cloud sync is not configured." }, { status: 400 });
  }
  try {
    const body = (await request.json()) as {
      items?: unknown[];
      tombstones?: Record<string, number>;
      convos?: unknown[];
      convoTombstones?: Record<string, number>;
    };
    const items = Array.isArray(body.items) ? body.items : [];
    const tombstones =
      body.tombstones && typeof body.tombstones === "object" ? body.tombstones : {};
    const convos = Array.isArray(body.convos) ? body.convos : [];
    const convoTombstones =
      body.convoTombstones && typeof body.convoTombstones === "object"
        ? body.convoTombstones
        : {};

    const payload = JSON.stringify({ items, tombstones, convos, convoTombstones });
    // Upstash REST 對單一 command 有大小上限;寧願唔同步對話,都唔好成次同步失敗。
    if (payload.length > 900_000) {
      const trimmed = JSON.stringify({ items, tombstones, convos: [], convoTombstones });
      await kvCommand(["SET", SYNC_KEY, trimmed]);
      return NextResponse.json({
        ok: true,
        count: items.length,
        convoCount: 0,
        warning: "Conversations were too large to sync; saved items were synced.",
      });
    }
    await kvCommand(["SET", SYNC_KEY, payload]);
    return NextResponse.json({ ok: true, count: items.length, convoCount: convos.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to write to the cloud.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
