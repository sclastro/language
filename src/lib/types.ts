/** 難度:影響 AI 用字深淺同回覆長度。 */
export type Level = "beginner" | "intermediate" | "advanced";

/** 一條針對用戶英文的糾正。explanation 使用繁體中文。 */
export type Correction = {
  original: string;
  corrected: string;
  explanation: string;
};

/** 模型每次回覆的結構。 */
export type TutorResponse = {
  /** 僅包含對話英文回覆(不含糾正/中文)。 */
  reply: string;
  /** 針對最新一句的逐點糾正。 */
  corrections: Correction[];
  /** 用戶最新一句的完整正確／自然英文版本;無需修改則與原句相同。 */
  rewrite: string;
  /** 模型輸出被 max_tokens 截斷,內容是搶救回來的(可能不齊全)。 */
  truncated?: boolean;
};

/** 聊天訊息(前端與 API 之間傳遞的格式)。 */
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** API 成功回覆:tutor 內容 + 大約使用的 token 數(供用戶查看額度)。 */
export type ChatApiResponse = TutorResponse & {
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
};
