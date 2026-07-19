/** 情境對話(client-safe 清單;prompt 指示喺 server 端 prompt.ts 用)。 */
export type ScenarioId =
  | "free"
  | "interview"
  | "doctor"
  | "restaurant"
  | "complaint"
  | "travel";

export const SCENARIOS: { id: ScenarioId; label: string; brief: string }[] = [
  { id: "free", label: "自由傾偈", brief: "" },
  {
    id: "interview",
    label: "見工面試",
    brief:
      "You are a hiring manager interviewing the learner for a job. Ask realistic interview questions one at a time (background, strengths, scenarios). Stay in character.",
  },
  {
    id: "doctor",
    label: "睇醫生",
    brief:
      "You are a doctor at a clinic. The learner is your patient. Ask about symptoms, give simple advice, arrange follow-up. Stay in character.",
  },
  {
    id: "restaurant",
    label: "餐廳點餐",
    brief:
      "You are a waiter at a restaurant. Greet, take orders, recommend dishes, handle requests and the bill. Stay in character.",
  },
  {
    id: "complaint",
    label: "電話投訴",
    brief:
      "You are a customer-service agent on the phone. The learner is calling to complain about a product/service. Respond professionally, ask for details, offer solutions. Stay in character.",
  },
  {
    id: "travel",
    label: "旅行問路",
    brief:
      "You are a friendly local. The learner is a tourist asking for directions and recommendations. Stay in character.",
  },
];

export function scenarioBrief(id: string | undefined): string {
  return SCENARIOS.find((s) => s.id === id)?.brief ?? "";
}
