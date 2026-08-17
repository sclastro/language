import { NextResponse } from "next/server";
import { getPoeClient, DEFAULT_TTS_MODEL, friendlyError } from "@/lib/poe";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel:為語音生成預留較多時間

const MAX_CHARS = 600; // 控制成本:太長就截短

/**
 * TTS:將英文文字交給 Poe 的 TTS bot(預設 elevenlabs-v3),
 * 它會回傳一條音訊 URL(poecdn,公開可播)。前端取得該 URL 後直接以 <audio> 播放。
 */
export async function POST(request: Request) {
  let text: string;
  let raw = false;
  try {
    const body = (await request.json()) as { text?: string; raw?: boolean };
    text = (body.text ?? "").trim().slice(0, MAX_CHARS);
    raw = body.raw === true;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "未提供要朗讀的文字。" }, { status: 400 });
  }

  try {
    const client = getPoeClient();
    const completion = await client.chat.completions.create({
      model: DEFAULT_TTS_MODEL,
      messages: [{ role: "user", content: text }],
    });
    const url = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!/^https?:\/\//.test(url)) {
      return NextResponse.json(
        { error: "TTS 未回傳有效的音訊連結。" },
        { status: 502 }
      );
    }
    if (raw) {
      // 直接將音訊 bytes 送返前端(前端會存入 IndexedDB 做本機快取)。
      const audio = await fetch(url);
      if (!audio.ok) {
        return NextResponse.json({ error: "下載音訊失敗。" }, { status: 502 });
      }
      const buf = await audio.arrayBuffer();
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "x-audio-url": url,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({ url });
  } catch (err) {
    const { message, status } = friendlyError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
