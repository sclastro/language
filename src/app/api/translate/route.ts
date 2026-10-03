import { NextResponse } from "next/server";
import {
  getPoeClient,
  DEFAULT_MODEL,
  AVAILABLE_MODELS,
  friendlyError,
} from "@/lib/poe";
import { buildTranslatePrompt, parseTranslation, MAX_INPUT_CHARS } from "@/lib/translate";

export const runtime = "nodejs";
export const maxDuration = 30;

// 譯文是短句,600 已足夠;只按實際生成的 token 扣 points。
const MAX_TOKENS = 600;

/** 中文 → 簡單口語英文。回 `{english, alternatives, usage}`。 */
export async function POST(request: Request) {
  let text = "";
  let model = DEFAULT_MODEL;
  try {
    const body = (await request.json()) as { text?: string; model?: string };
    text = (body.text ?? "").trim();
    if (body.model && (AVAILABLE_MODELS as readonly string[]).includes(body.model)) {
      model = body.model;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: "Nothing to translate." }, { status: 400 });
  if (text.length > MAX_INPUT_CHARS) {
    return NextResponse.json(
      { error: `That is too long. Please keep it under ${MAX_INPUT_CHARS} characters.` },
      { status: 413 }
    );
  }

  try {
    const client = getPoeClient();
    const system = buildTranslatePrompt();
    const completion = await client.chat.completions.create({
      model,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: system },
        { role: "user", content: text },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const result = parseTranslation(raw);
    if (!result.english) {
      return NextResponse.json(
        { error: "The translation came back empty. Please try again." },
        { status: 502 }
      );
    }
    // 估算 token(與 /api/chat 一致:字元數 / 4)
    const totalTokens = Math.round((system.length + text.length + raw.length) / 4);
    return NextResponse.json({ ...result, usage: { totalTokens } });
  } catch (err) {
    const { message, status } = friendlyError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
