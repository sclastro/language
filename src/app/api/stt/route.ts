import { NextResponse } from "next/server";
import { getPoeClient, DEFAULT_STT_MODEL, friendlyError } from "@/lib/poe";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel:為轉錄預留較多時間

// 限制音訊大小(base64 字元數)。Vercel serverless 的 request body 上限為 4.5MB,
// 因此需與之對齊(預留少許 header 空間),不要等平台攔截 —— 這樣用戶至少能看到清楚的錯誤訊息。
const MAX_DATA_URL_LEN = 4_200_000;

/**
 * STT:接收前端錄音(base64 data URL),交給 Poe 的 whisper 轉成文字。
 * 使用 OpenAI-compatible 的 `file` content part(唯一可傳送 audio 的方式)。
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
      { error: "沒有有效的音訊資料。" },
      { status: 400 }
    );
  }
  if (dataUrl.length > MAX_DATA_URL_LEN) {
    return NextResponse.json(
      { error: "錄音過長,請縮短內容再試。" },
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
