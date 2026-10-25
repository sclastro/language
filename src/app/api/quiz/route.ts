import { NextResponse } from "next/server";
import { getPoeClient, DEFAULT_MODEL, AVAILABLE_MODELS, friendlyError } from "@/lib/poe";
import { buildDistractorPrompt, parseDistractors } from "@/lib/quiz";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 一次最多為幾句生成干擾項(一輪 quiz 最多 20 題)。 */
const MAX_ITEMS = 20;
const MAX_TOKENS = 3000;

type InItem = { en?: string; zh?: string };

/** 多項選擇的干擾項:回 `{distractors: (string[] | null)[], usage}`,與輸入按次序對齊。 */
export async function POST(request: Request) {
  let items: { en: string; zh: string }[] = [];
  let model = DEFAULT_MODEL;
  try {
    const body = (await request.json()) as { items?: InItem[]; model?: string };
    items = (Array.isArray(body.items) ? body.items : [])
      .map((i) => ({
        en: typeof i?.en === "string" ? i.en.trim().slice(0, 400) : "",
        zh: typeof i?.zh === "string" ? i.zh.trim().slice(0, 200) : "",
      }))
      .filter((i) => i.en)
      .slice(0, MAX_ITEMS);
    if (body.model && (AVAILABLE_MODELS as readonly string[]).includes(body.model)) {
      model = body.model;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "No sentences to make options for." }, { status: 400 });
  }

  try {
    const client = getPoeClient();
    const system = buildDistractorPrompt();
    const user = items
      .map((it, i) => `${i + 1}. ${it.en}${it.zh ? `  (Chinese meaning: ${it.zh})` : ""}`)
      .join("\n");
    const completion = await client.chat.completions.create({
      model,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const distractors = parseDistractors(
      raw,
      items.map((i) => i.en)
    );
    const totalTokens = Math.round((system.length + user.length + raw.length) / 4);
    return NextResponse.json({ distractors, usage: { totalTokens } });
  } catch (err) {
    const { message, status } = friendlyError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
