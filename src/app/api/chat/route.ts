import { NextResponse } from "next/server";
import { getPoeClient, DEFAULT_MODEL, AVAILABLE_MODELS } from "@/lib/poe";
import { buildSystemPrompt } from "@/lib/prompt";
import type { ChatMessage, Level, TutorResponse } from "@/lib/types";

export const runtime = "nodejs";

const MAX_HISTORY = 8; // 只保留最近幾條去慳 token
const MAX_TOKENS = 600;
const VALID_LEVELS: Level[] = ["beginner", "intermediate", "advanced"];

type Body = {
  messages?: ChatMessage[];
  level?: Level;
  model?: string;
};

/** 由模型回覆(可能夾住 markdown code fence)抽出 JSON 並穩健 parse。 */
function parseTutorResponse(raw: string): TutorResponse {
  let text = raw.trim();
  // 去掉 ```json ... ``` 之類嘅 fence
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // 退而求其次:抽第一個 { 到最後一個 }
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  }

  try {
    const obj = JSON.parse(text) as Partial<TutorResponse>;
    return {
      reply: typeof obj.reply === "string" ? obj.reply : "",
      corrections: Array.isArray(obj.corrections)
        ? obj.corrections
            .filter(
              (c): c is NonNullable<typeof c> =>
                !!c && typeof c.original === "string" && typeof c.corrected === "string"
            )
            .map((c) => ({
              original: c.original,
              corrected: c.corrected,
              explanation: typeof c.explanation === "string" ? c.explanation : "",
            }))
        : [],
      rewrite: typeof obj.rewrite === "string" ? obj.rewrite : "",
    };
  } catch {
    // 完全 parse 唔到就當佢淨係回覆,冇糾正,唔好白屏。
    return { reply: raw.trim(), corrections: [], rewrite: "" };
  }
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "冇對話內容。" }, { status: 400 });
  }

  const level: Level = VALID_LEVELS.includes(body.level as Level)
    ? (body.level as Level)
    : "intermediate";
  const model =
    body.model && (AVAILABLE_MODELS as readonly string[]).includes(body.model)
      ? body.model
      : DEFAULT_MODEL;

  const trimmed = messages.slice(-MAX_HISTORY);

  try {
    const client = getPoeClient();
    const completion = await client.chat.completions.create({
      model,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: buildSystemPrompt(level) },
        ...trimmed.map((m) => ({ role: m.role, content: m.content })),
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const tutor = parseTutorResponse(raw);
    const usage = completion.usage
      ? {
          promptTokens: completion.usage.prompt_tokens ?? 0,
          completionTokens: completion.usage.completion_tokens ?? 0,
          totalTokens: completion.usage.total_tokens ?? 0,
        }
      : undefined;

    return NextResponse.json({ ...tutor, usage });
  } catch (err) {
    const message = err instanceof Error ? err.message : "呼叫 Poe API 時出錯。";
    // 401/429 等由 SDK 帶落 message,直接俾用戶睇。
    const status =
      typeof (err as { status?: number }).status === "number"
        ? (err as { status: number }).status
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
