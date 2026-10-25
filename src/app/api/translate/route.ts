import { NextResponse } from "next/server";
import {
  getPoeClient,
  DEFAULT_MODEL,
  AVAILABLE_MODELS,
  friendlyError,
} from "@/lib/poe";
import {
  buildTranslatePrompt,
  parseTranslation,
  splitForTranslation,
  joinTranslations,
  MAX_INPUT_CHARS,
  type Translation,
  type TranslatePart,
} from "@/lib/translate";

export const runtime = "nodejs";
export const maxDuration = 60;

// 只按實際生成的 token 扣 points,上限寬鬆無妨。曾用 600:一千字的中文通告譯成英文
// 加上 JSON 已接近上限,截斷後只剩空白或半句。每段最多 CHUNK_CHARS(1000)字,
// 2500 足夠有餘。
const MAX_TOKENS = 2500;

type Client = ReturnType<typeof getPoeClient>;

/** 譯一段;回傳結果及估算的 token 數(字元數 / 4,與 /api/chat 一致)。 */
async function translateOne(
  client: Client,
  model: string,
  text: string,
  part?: TranslatePart
): Promise<{ result: Translation; tokens: number }> {
  const system = buildTranslatePrompt(part);
  const completion = await client.chat.completions.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: "system", content: system },
      { role: "user", content: text },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  return {
    result: parseTranslation(raw),
    tokens: Math.round((system.length + text.length + raw.length) / 4),
  };
}

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
    const { chunks, seps } = splitForTranslation(text);
    // 長文:各段同時翻譯,總時間約等於譯一段,不會超出 serverless 時限
    const outs = await Promise.all(
      chunks.map((c, i) =>
        translateOne(
          client,
          model,
          c,
          chunks.length > 1 ? { index: i + 1, total: chunks.length } : undefined
        )
      )
    );
    // 任何一段譯不到都要報錯:靜靜少了一段比失敗更糟
    if (outs.some((o) => !o.result.english)) {
      return NextResponse.json(
        { error: "The translation came back empty. Please try again." },
        { status: 502 }
      );
    }
    const english =
      outs.length === 1 ? outs[0].result.english : joinTranslations(outs.map((o) => o.result.english), seps);
    const alternatives = outs.length === 1 ? outs[0].result.alternatives : [];
    const totalTokens = outs.reduce((n, o) => n + o.tokens, 0);
    return NextResponse.json({ english, alternatives, usage: { totalTokens } });
  } catch (err) {
    const { message, status } = friendlyError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
