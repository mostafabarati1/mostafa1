/** تحلیل سطح دشواری سوال با هوش مصنوعی (فقط سمت سرور). */
import { generateAdminJson, getAdminAiModel } from "@/lib/ai-admin/gapgpt.server";

const SYSTEM = `تو کارشناس طراحی سوال آزمون‌های استخدامی فارسی هستی.
سطح دشواری سوال چهارگزینه‌ای داده‌شده را تخمین بزن.
خروجی فقط JSON با این ساختار:
{"difficulty":"easy|medium|hard","confidence":0.0,"reason":"دلیل کوتاه فارسی"}
- confidence عددی بین ۰ و ۱ باشد.
- reason حداکثر دو جمله کوتاه فارسی باشد.
- هیچ متن اضافه‌ای بیرون از JSON ننویس.`;

export type DifficultyInput = {
  questionText: string;
  options: { text: string; isCorrect: boolean }[];
  subject?: string | null;
  category?: string | null;
  currentDifficulty?: string | null;
};

export type DifficultySuggestion = {
  difficulty: "easy" | "medium" | "hard";
  confidence: number;
  reason: string;
  model: string;
};

const LEVELS = ["easy", "medium", "hard"] as const;

export async function suggestDifficulty(input: DifficultyInput): Promise<DifficultySuggestion> {
  const prompt = [
    `درس: ${input.subject ?? "نامشخص"}`,
    `دسته‌بندی: ${input.category ?? "نامشخص"}`,
    `سطح ثبت‌شده فعلی: ${input.currentDifficulty ?? "نامشخص"}`,
    "",
    `صورت سوال: ${input.questionText}`,
    "گزینه‌ها:",
    ...input.options.map((o, i) => `${i + 1}) ${o.text}${o.isCorrect ? "  ← صحیح" : ""}`),
  ].join("\n");

  const raw = (await generateAdminJson(SYSTEM, prompt)) as Record<string, unknown>;
  const level = String(raw["difficulty"] ?? "").toLowerCase();
  const difficulty = (LEVELS as readonly string[]).includes(level)
    ? (level as DifficultySuggestion["difficulty"])
    : "medium";
  const confidenceRaw = Number(raw["confidence"] ?? 0);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.min(1, Math.max(0, confidenceRaw > 1 ? confidenceRaw / 100 : confidenceRaw))
    : 0;

  return {
    difficulty,
    confidence,
    reason: String(raw["reason"] ?? "").slice(0, 1000),
    model: getAdminAiModel(),
  };
}
