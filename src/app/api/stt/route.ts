import { NextResponse } from "next/server";
import { getPoeClient, DEFAULT_STT_MODEL, friendlyError } from "@/lib/poe";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel:俾轉錄多啲時間 headroom

// 限制音訊大小(base64 字元數)。Vercel serverless 嘅 request body 上限係 4.5MB,
// 所以我哋要對齊佢(留少少 header 空間),唔好等平台先擋 —— 咁用戶至少見到人話錯誤。
const MAX_DATA_URL_LEN = 4_200_000;

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
    const { message, status } = friendlyError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
