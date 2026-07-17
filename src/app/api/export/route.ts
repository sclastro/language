import { NextResponse } from "next/server";
import { getPoeClient, DEFAULT_TTS_MODEL } from "@/lib/poe";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ITEMS = 60;

type InItem = { text?: string; url?: string };

/** 去掉 MP3 頭尾嘅 ID3 tag,咁多段 MP3 幀先可以乾淨咁串埋一齊。 */
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
  // 冇 cache 過嘅 URL 就即刻生成(會用 points)。
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
    return NextResponse.json({ error: "冇揀到任何句子。" }, { status: 400 });
  }

  try {
    const client = getPoeClient();
    const parts: Buffer[] = [];
    // 逐句處理(順序),保持播放次序同你揀嘅一樣。
    for (const item of items) {
      const buf = await itemToMp3(item, client);
      if (buf) parts.push(buf);
    }
    if (parts.length === 0) {
      return NextResponse.json({ error: "生成音訊失敗。" }, { status: 502 });
    }

    const merged = Buffer.concat(parts);
    return new NextResponse(new Uint8Array(merged), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="review-${Date.now()}.mp3"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "匯出出錯。";
    const status =
      typeof (err as { status?: number }).status === "number"
        ? (err as { status: number }).status
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
