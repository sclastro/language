import { NextResponse } from "next/server";
import { getPoeClient, DEFAULT_MODEL, friendlyError } from "@/lib/poe";

export const runtime = "nodejs";
export const maxDuration = 30;

/** 生字查詢:提供字詞及其所在句子,回傳繁中解釋 + 一句新例句。 */
export async function POST(request: Request) {
  let word = "";
  let sentence = "";
  try {
    const body = (await request.json()) as { word?: string; sentence?: string };
    word = (body.word ?? "").trim().slice(0, 60);
    sentence = (body.sentence ?? "").trim().slice(0, 300);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!word) return NextResponse.json({ error: "No word provided to look up." }, { status: 400 });

  try {
    const client = getPoeClient();
    const completion = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      max_tokens: 220,
      messages: [
        {
          role: "user",
          content: [
            `Define the English word "${word}"`,
            sentence ? `as used in this sentence: "${sentence}".` : ".",
            "For an English learner. Respond with ONLY JSON:",
            '{"meaning": "a short English definition, including the part of speech", "example": "one short natural English example sentence"}',
            "Write the definition in simple English suitable for an intermediate learner. Do not use Chinese.",
          ].join(" "),
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
    let meaning = "";
    let example = "";
    try {
      const obj = JSON.parse(text) as { meaning?: string; example?: string };
      meaning = typeof obj.meaning === "string" ? obj.meaning : "";
      example = typeof obj.example === "string" ? obj.example : "";
    } catch {
      meaning = raw.trim().slice(0, 200);
    }
    return NextResponse.json({ word, meaning, example });
  } catch (err) {
    const { message, status } = friendlyError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
