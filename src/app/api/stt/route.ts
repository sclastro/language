import { NextResponse } from "next/server";
import { getPoeClient, DEFAULT_STT_MODEL } from "@/lib/poe";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel:俾轉錄多啲時間 headroom

// 限制音訊大小(base64 字元數)。~8MB base64 ≈ 6MB 原始,足夠一段口說。
const MAX_DATA_URL_LEN = 8_000_000;

/**
 * STT:收前端錄音(base64 data URL),交俾 Poe 嘅 whisper 轉做文字。
 * 用 OpenAI-compatible 嘅 `file` content part(唯一收 audio 嘅方式)。
 */
export async function POST(request: Request) {
  let dataUrl: string;
  let filename: string;
  try {
    const body = (await request.json()) as {
      audio?: string;
      filename?: string;
    };
    dataUrl = body.audio ?? "";
    filename = body.filename || "speech.webm";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!dataUrl.startsWith("data:")) {
    return NextResponse.json(
      { error: "冇有效嘅音訊資料。" },
      { status: 400 }
    );
  }
  if (dataUrl.length > MAX_DATA_URL_LEN) {
    return NextResponse.json(
      { error: "錄音太長,請講短啲再試。" },
      { status: 413 }
    );
  }

  try {
    const client = getPoeClient();
    const completion = await client.chat.completions.create({
      model: DEFAULT_STT_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcribe the English speech exactly. Output only the transcript, no extra words.",
            },
            {
              type: "file",
              file: { filename, file_data: dataUrl },
            },
          ],
        },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "STT 出錯。";
    const status =
      typeof (err as { status?: number }).status === "number"
        ? (err as { status: number }).status
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
