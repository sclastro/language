import { NextResponse } from "next/server";
import { getPoeClient, DEFAULT_MODEL } from "@/lib/poe";

export const runtime = "nodejs";
export const maxDuration = 30;

/** 生字查詢:俾個字 + 佢出現嘅句子,回繁中解釋 + 一句新例句。 */
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
  if (!word) return NextResponse.json({ error: "冇字可以查。" }, { status: 400 });

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
            "For a Cantonese-speaking learner. Respond with ONLY JSON:",
            '{"meaning": "簡短繁體中文解釋(包詞性)", "example": "one short natural English example sentence"}',
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
    const message = err instanceof Error ? err.message : "查詢出錯。";
    const status =
      typeof (err as { status?: number }).status === "number"
        ? (err as { status: number }).status
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
