import { NextResponse } from "next/server";
import {
  getPoeClient,
  DEFAULT_MODEL,
  AVAILABLE_MODELS,
  friendlyError,
} from "@/lib/poe";
import { buildSystemPrompt } from "@/lib/prompt";
import type { ChatMessage, Level, TutorResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_HISTORY = 8; // 只保留最近數條以節省 token
const MAX_TOKENS = 600;
const VALID_LEVELS: Level[] = ["beginner", "intermediate", "advanced"];

type Body = {
  messages?: ChatMessage[];
  level?: Level;
  model?: string;
  scenario?: string;
};

/** 由模型回覆(可能夾雜 markdown code fence)抽出 JSON 並穩健 parse。 */
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
 * 由尚未完成的 JSON 串流中,抽出 reply 欄位目前為止的內容(供前端逐字顯示)。
 * 尋找 `"reply":"` 之後的字串,處理跳脫字元,遇到未閉合的引號即視為「目前到此為止」。
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
  // 結尾可能截斷了一半的 escape,先嘗試 parse,失敗則再切一格重試
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
    return NextResponse.json({ error: "未提供對話內容。" }, { status: 400 });
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

  // 提早取得 client:缺少 key 之類的設定問題要回傳清楚的 JSON 錯誤,
  // 不要留在 stream 內才拋出(否則客戶端只會見到斷線,無從查起)。
  let client: ReturnType<typeof getPoeClient>;
  try {
    client = getPoeClient();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Poe client 初始化失敗。" },
      { status: 500 }
    );
  }

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, obj: unknown) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

  const stream = new ReadableStream({
    async start(controller) {
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
        // 串流失敗(部分 model/情況不支援)→ 靜默退回一次過模式
        try {
          const completion = await client.chat.completions.create({
            model,
            max_tokens: MAX_TOKENS,
            messages: chatMessages,
          });
          full = completion.choices[0]?.message?.content ?? "";
        } catch (err) {
          send(controller, { t: "e", error: friendlyError(err).message });
          controller.close();
          return;
        }
      }

      const tutor = parseTutorResponse(full);
      // 估算 token(串流不一定回傳 usage):字元數 / 4
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
