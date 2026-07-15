/** 難度:影響 AI 用字深淺同回覆長度。 */
export type Level = "beginner" | "intermediate" | "advanced";

/** 一條針對用戶英文嘅糾正。explanation 用繁體中文。 */
export type Correction = {
  original: string;
  corrected: string;
  explanation: string;
};

/** 模型每次回覆嘅結構:一句自然英文延續對話 + 針對最新一句嘅糾正。 */
export type TutorResponse = {
  reply: string;
  corrections: Correction[];
};

/** 聊天訊息(前端同 API 之間傳嘅格式)。 */
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** API 成功回覆:tutor 內容 + 大約用咗幾多 token(俾用戶睇額度)。 */
export type ChatApiResponse = TutorResponse & {
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
};
