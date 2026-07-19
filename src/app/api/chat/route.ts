import { NextResponse } from "next/server";
import { getPoeClient, DEFAULT_MODEL, AVAILABLE_MODELS } from "@/lib/poe";
import { buildSystemPrompt } from "@/lib/prompt";
import type { ChatMessage, Level, TutorResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_HISTORY = 8; // 只保留最近幾條去慳 token
const MAX_TOKENS = 600;
const VALID_LEVELS: Level[] = ["beginner", "intermediate", "advanced"];

type Body = {
  messages?: ChatMessage[];
  level?: Level;
  model?: string;
  scenario?: string;
};

/** 由模型回覆(可能夾住 markdown code fence)抽出 JSON 並穩健 parse。 */
function parseTutorResponse(raw: string): TutorResponse {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
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
    return { reply: raw.trim(), corrections: [], rewrite: "" };
  }
}

/**
 * 由未完成嘅 JSON 串流入面,抽出 reply 欄位目前為止嘅內容(俾前端逐字顯示)。
 * 揾 `"reply":"` 之後嘅字串,處理跳脫字元,遇到未閂嘅引號就當「講到呢度」。
 */
function extractPartialReply(full: string): string {
  const m = full.match(/"reply"\s*:\s*"/);
  if (!m || m.index === undefined) return "";
  let seg = "";
  for (let i = m.index + m[0].length; i < full.length; i++) {
    const ch = full[i];
    if (ch === "\\") {
      seg += ch + (full[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === '"') break;
    seg += ch;
  }
  // 尾巴可能斬咗一半 escape,試 parse,唔得就切一格再試
  for (let cut = 0; cut < 2; cut++) {
    try {
      return JSON.parse('"' + seg.slice(0, seg.length - cut) + '"') as string;
    } catch {
      /* retry */
    }
  }
  return "";
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
  const chatMessages = [
    { role: "system" as const, content: buildSystemPrompt(level, body.scenario) },
    ...trimmed.map((m) => ({ role: m.role, content: m.content })),
  ];

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, obj: unknown) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

  const stream = new ReadableStream({
    async start(controller) {
      const client = getPoeClient();
      let full = "";
      try {
        // 首選:串流(reply 逐字送去前端)
        const s = await client.chat.completions.create({
          model,
          max_tokens: MAX_TOKENS,
          stream: true,
          messages: chatMessages,
        });
        let lastLen = 0;
        for await (const chunk of s) {
          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          if (!delta) continue;
          full += delta;
          const partial = extractPartialReply(full);
          if (partial.length > lastLen) {
            lastLen = partial.length;
            send(controller, { t: "r", reply: partial });
          }
        }
      } catch {
        // 串流失敗(有啲 model/情況唔支援)→ 靜靜地退返一次過模式
        try {
          const completion = await client.chat.completions.create({
            model,
            max_tokens: MAX_TOKENS,
            messages: chatMessages,
          });
          full = completion.choices[0]?.message?.content ?? "";
        } catch (err) {
          const message = err instanceof Error ? err.message : "呼叫 Poe API 時出錯。";
          send(controller, { t: "e", error: message });
          controller.close();
          return;
        }
      }

      const tutor = parseTutorResponse(full);
      // 估算 token(串流唔一定回 usage):字元數 / 4
      const promptChars = chatMessages.reduce((a, m) => a + m.content.length, 0);
      const usage = {
        promptTokens: Math.round(promptChars / 4),
        completionTokens: Math.round(full.length / 4),
        totalTokens: Math.round((promptChars + full.length) / 4),
      };
      send(controller, { t: "f", ...tutor, usage });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
