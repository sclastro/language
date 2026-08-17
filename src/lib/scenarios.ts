/** 情境對話(client-safe 清單;prompt 指示於 server 端 prompt.ts 使用)。 */
export type ScenarioId =
  | "free"
  | "interview"
  | "doctor"
  | "restaurant"
  | "complaint"
  | "travel";

export const SCENARIOS: { id: ScenarioId; label: string; brief: string }[] = [
  { id: "free", label: "Free chat", brief: "" },
  {
    id: "interview",
    label: "Job interview",
    brief:
      "You are a hiring manager interviewing the learner for a job. Ask realistic interview questions one at a time (background, strengths, scenarios). Stay in character.",
  },
  {
    id: "doctor",
    label: "Doctor’s visit",
    brief:
      "You are a doctor at a clinic. The learner is your patient. Ask about symptoms, give simple advice, arrange follow-up. Stay in character.",
  },
  {
    id: "restaurant",
    label: "Ordering at a restaurant",
    brief:
      "You are a waiter at a restaurant. Greet, take orders, recommend dishes, handle requests and the bill. Stay in character.",
  },
  {
    id: "complaint",
    label: "Complaint call",
    brief:
      "You are a customer-service agent on the phone. The learner is calling to complain about a product/service. Respond professionally, ask for details, offer solutions. Stay in character.",
  },
  {
    id: "travel",
    label: "Asking for directions",
    brief:
      "You are a friendly local. The learner is a tourist asking for directions and recommendations. Stay in character.",
  },
];

export function scenarioBrief(id: string | undefined): string {
  return SCENARIOS.find((s) => s.id === id)?.brief ?? "";
}
