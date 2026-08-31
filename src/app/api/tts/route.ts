import { NextResponse } from "next/server";
import { getPoeClient, DEFAULT_TTS_MODEL, friendlyError } from "@/lib/poe";
import { limitWords } from "@/lib/ttsLimit";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel:為語音生成預留較多時間


/**
 * TTS:將英文文字交給 Poe 的 TTS bot(預設 elevenlabs-v3),
 * 它會回傳一條音訊 URL(poecdn,公開可播)。前端取得該 URL 後直接以 <audio> 播放。
 */
export async function POST(request: Request) {
  let text: string;
  let raw = false;
  let truncated = false;
  try {
    const body = (await request.json()) as { text?: string; raw?: boolean };
    const limited = limitWords(body.text ?? "");
    text = limited.text;
    truncated = limited.truncated;
    raw = body.raw === true;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "No text provided to read aloud." }, { status: 400 });
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
        { error: "TTS did not return a valid audio link." },
        { status: 502 }
      );
    }
    if (raw) {
      // 直接將音訊 bytes 送返前端(前端會存入 IndexedDB 做本機快取)。
      const audio = await fetch(url);
      if (!audio.ok) {
        return NextResponse.json({ error: "Failed to download the audio." }, { status: 502 });
      }
      const buf = await audio.arrayBuffer();
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "x-audio-url": url,
          "x-truncated": String(truncated),
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({ url, truncated });
  } catch (err) {
    const { message, status } = friendlyError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
