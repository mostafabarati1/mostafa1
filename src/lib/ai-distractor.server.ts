/** تحلیل کیفیت گزینه‌های نادرست یک سوال چهارگزینه‌ای (فقط سمت سرور). */
import { generateAdminJson } from "@/lib/ai-admin/gapgpt.server";
import type { DistractorAnalysisItem, DistractorQuality } from "./ai-distractor.types";

const SYSTEM = `تو کارشناس کنترل کیفیت بانک سوال فارسی هستی.
گزینه‌های نادرست (distractor) یک سوال چهارگزینه‌ای را ارزیابی کن.
خروجی فقط JSON:
{"items":[{"option_index":0-based index از میان همه گزینه‌ها,
  "quality":"strong|weak|obviously_wrong|too_close",
  "reason":"دلیل فارسی کوتاه",
  "suggestion":"متن پیشنهادی جایگزین برای بهبود گزینه (اگر لازم است)"}]}
- فقط گزینه‌های نادرست (is_correct=false) را تحلیل کن.
- strong یعنی گزینه فریب‌دهنده و معقول است؛ weak یعنی ضعیف است؛
  obviously_wrong یعنی واضحاً غلط است؛ too_close یعنی به‌قدری شبیه پاسخ صحیح است که ممکن است اشتباهاً درست تلقی شود.`;

const QUALITIES: readonly DistractorQuality[] = ["strong", "weak", "obviously_wrong", "too_close"];

export type DistractorInput = {
  questionText: string;
  difficulty: string | null;
  options: { text: string; is_correct: boolean }[];
};

export async function analyzeDistractors(
  input: DistractorInput,
): Promise<DistractorAnalysisItem[]> {
  const prompt = [
    `سطح دشواری: ${input.difficulty ?? "نامشخص"}`,
    `صورت سوال: ${input.questionText}`,
    "گزینه‌ها:",
    ...input.options.map((o, i) => `${i}) ${o.text}${o.is_correct ? "  ← صحیح" : ""}`),
  ].join("\n");

  const raw = (await generateAdminJson(SYSTEM, prompt)) as Record<string, unknown>;
  const list = Array.isArray(raw["items"]) ? (raw["items"] as unknown[]) : [];

  return list
    .map((item) => {
      const it = item as Record<string, unknown>;
      const index = Number(it["option_index"]);
      const quality = String(it["quality"] ?? "weak");
      return {
        option_index: Number.isFinite(index) ? index : -1,
        quality: (QUALITIES as readonly string[]).includes(quality)
          ? (quality as DistractorQuality)
          : "weak",
        reason: String(it["reason"] ?? "").slice(0, 600),
        suggestion: String(it["suggestion"] ?? "").slice(0, 600),
      };
    })
    .filter(
      (it) =>
        it.option_index >= 0 &&
        it.option_index < input.options.length &&
        !input.options[it.option_index]?.is_correct,
    );
}
