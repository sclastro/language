import { NextResponse } from "next/server";
import { getPoeClient, DEFAULT_TTS_MODEL } from "@/lib/poe";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel:俾語音生成多啲時間 headroom

const MAX_CHARS = 600; // 控制成本:太長就截短

/**
 * TTS:將英文文字交俾 Poe 嘅 TTS bot(預設 elevenlabs-v3),
 * 佢會回一條音訊 URL(poecdn,公開可播)。前端攞條 URL 直接 <audio> 播。
 */
export async function POST(request: Request) {
  let text: string;
  try {
    const body = (await request.json()) as { text?: string };
    text = (body.text ?? "").trim().slice(0, MAX_CHARS);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "冇文字可以讀。" }, { status: 400 });
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
        { error: "TTS 冇回到有效嘅音訊連結。" },
        { status: 502 }
      );
    }
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "TTS 出錯。";
    const status =
      typeof (err as { status?: number }).status === "number"
        ? (err as { status: number }).status
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
