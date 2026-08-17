import { NextResponse } from "next/server";
import { getPoeClient, DEFAULT_TTS_MODEL, friendlyError } from "@/lib/poe";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 未快取的句子需即場生成語音(每句約 3–10 秒),但 serverless 只有 60 秒。
 * 因此:① 限制句數 ② 併發生成 ③ 預留安全時間,時限將至便不再開新工作,
 *       ④ 不可靜默跳過失敗的句子,必須告知用戶。
 */
const MAX_ITEMS = 30;
const CONCURRENCY = 4;
const TIME_BUDGET_MS = 45_000;

type InItem = { text?: string; url?: string };

/** 去除 MP3 頭尾的 ID3 tag,多段 MP3 幀才能乾淨地串接在一起。 */
function stripId3(buf: Buffer): Buffer {
  let b = buf;
  // 去掉開頭 ID3v2("ID3" + 6 bytes header,size 係 synchsafe integer)
  if (b.length > 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    const size =
      ((b[6] & 0x7f) << 21) |
      ((b[7] & 0x7f) << 14) |
      ((b[8] & 0x7f) << 7) |
      (b[9] & 0x7f);
    const total = 10 + size;
    if (total < b.length) b = b.subarray(total);
  }
  // 去掉結尾 ID3v1(128 bytes,以 "TAG" 開頭)
  if (b.length > 128) {
    const tail = b.subarray(b.length - 128);
    if (tail[0] === 0x54 && tail[1] === 0x41 && tail[2] === 0x47) {
      b = b.subarray(0, b.length - 128);
    }
  }
  return b;
}

async function itemToMp3(
  item: InItem,
  client: ReturnType<typeof getPoeClient>
): Promise<Buffer | null> {
  const text = (item.text ?? "").trim();
  if (!text) return null;

  let url = item.url;
  // 未快取過的 URL 需即時生成(會消耗 points)。
  if (!url || !/^https?:\/\//.test(url)) {
    const c = await client.chat.completions.create({
      model: DEFAULT_TTS_MODEL,
      messages: [{ role: "user", content: text }],
    });
    url = c.choices[0]?.message?.content?.trim();
  }
  if (!url || !/^https?:\/\//.test(url)) return null;

  const res = await fetch(url);
  if (!res.ok) return null;
  return stripId3(Buffer.from(await res.arrayBuffer()));
}

export async function POST(request: Request) {
  let items: InItem[];
  try {
    const body = (await request.json()) as { items?: InItem[] };
    items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "未選取任何句子。" }, { status: 400 });
  }

  try {
    const client = getPoeClient();
    const started = Date.now();
    const results = new Array<Buffer | null>(items.length).fill(null);
    let timedOut = false;

    // 併發處理(保持原本次序:各自寫返自己個 index),夠鐘就停手。
    let cursor = 0;
    async function worker() {
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        if (Date.now() - started > TIME_BUDGET_MS) {
          timedOut = true;
          return;
        }
        results[i] = await itemToMp3(items[i], client);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker)
    );

    const parts = results.filter((b): b is Buffer => b !== null);
    if (parts.length === 0) {
      return NextResponse.json(
        { error: "音訊生成失敗,一句都未能完成。請減少句數再試。" },
        { status: 502 }
      );
    }

    const missing = items.length - parts.length;
    const merged = Buffer.concat(parts);
    return new NextResponse(new Uint8Array(merged), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="review-${Date.now()}.mp3"`,
        "Cache-Control": "no-store",
        // 前端檢查這兩個 header 即知是否有遺漏,不會不知情地收下短檔。
        "x-included": String(parts.length),
        "x-missing": String(missing),
        "x-timed-out": String(timedOut),
      },
    });
  } catch (err) {
    const { message, status } = friendlyError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
