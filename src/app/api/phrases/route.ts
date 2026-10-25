import { NextResponse } from "next/server";
import { getPoeClient, DEFAULT_MODEL, AVAILABLE_MODELS, friendlyError } from "@/lib/poe";
import {
  buildPhrasesPrompt,
  parsePhraseSet,
  MAX_TOPIC_CHARS,
  type PhraseFormat,
} from "@/lib/phrases";
import type { Level } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// 十句連中文及提示約 1200 個 token;句式連例句最多約 2000。上限只是上限,不會多扣。
const MAX_TOKENS = 3000;

const FORMATS: PhraseFormat[] = ["sentences", "dialogue", "patterns"];
const LEVELS: Level[] = ["beginner", "intermediate", "advanced"];

/** 主題句庫:回 `{title, items, truncated, usage}`。 */
export async function POST(request: Request) {
  let topic = "";
  let format: PhraseFormat = "sentences";
  let level: Level = "intermediate";
  let model = DEFAULT_MODEL;
  let avoid: string[] = [];
  try {
    const body = (await request.json()) as {
      topic?: string;
      format?: string;
      level?: string;
      model?: string;
      avoid?: unknown;
    };
    topic = (body.topic ?? "").trim().slice(0, MAX_TOPIC_CHARS);
    if (FORMATS.includes(body.format as PhraseFormat)) format = body.format as PhraseFormat;
    if (LEVELS.includes(body.level as Level)) level = body.level as Level;
    if (body.model && (AVAILABLE_MODELS as readonly string[]).includes(body.model)) {
      model = body.model;
    }
    if (Array.isArray(body.avoid)) {
      avoid = body.avoid.filter((a): a is string => typeof a === "string").map((a) => a.slice(0, 200));
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!topic) return NextResponse.json({ error: "Pick or type a topic first." }, { status: 400 });

  try {
    const client = getPoeClient();
    const system = buildPhrasesPrompt({ topic, level, format, avoid });
    const completion = await client.chat.completions.create({
      model,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Topic: ${topic}` },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const result = parsePhraseSet(raw, format);
    if (result.items.length === 0) {
      return NextResponse.json(
        { error: "No sentences came back. Please try again." },
        { status: 502 }
      );
    }
    const totalTokens = Math.round((system.length + topic.length + raw.length) / 4);
    return NextResponse.json({ ...result, usage: { totalTokens } });
  } catch (err) {
    const { message, status } = friendlyError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
