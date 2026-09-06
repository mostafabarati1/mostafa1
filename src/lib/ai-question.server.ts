/** تولید سوال چهارگزینه‌ای با هوش مصنوعی (فقط سمت سرور). */
import { generateAdminJson } from "@/lib/ai-admin/gapgpt.server";
import type { AiQuestionGenerated } from "./ai-question.types";

const SYSTEM = `تو طراح سوالات چهارگزینه‌ای فارسی برای آزمون‌های استخدامی هستی.
با توجه به موضوع، دسته و نمونه‌های واقعی ارائه‌شده، سوال‌های جدید و اصیل (غیرتکراری) بساز.
خروجی فقط JSON با این ساختار:
{"questions":[{"question_text":"...", "difficulty":"easy|medium|hard",
  "options":[{"option_text":"...","is_correct":true|false}] (دقیقاً ۴ گزینه، دقیقاً یک گزینه صحیح),
  "explanation":"پاسخ تشریحی فارسی کوتاه"}]}
- سوال‌ها باید دقیق، بدون ابهام و هم‌سطح نمونه‌ها باشند.
- گزینه‌های نادرست باید معقول و نزدیک به پاسخ صحیح باشند (نه واضحاً غلط).`;

type FewShotExample = {
  question_text: string;
  difficulty: string | null;
  options: { text: string; is_correct: boolean }[];
};

export type GenerateQuestionsInput = {
  categoryName: string | null;
  subjectName: string | null;
  topic: string;
  count: number;
  examples: FewShotExample[];
};

export async function generateQuestions(
  input: GenerateQuestionsInput,
): Promise<AiQuestionGenerated[]> {
  const examplesText = input.examples.length
    ? input.examples
        .map(
          (e, i) =>
            `نمونه ${i + 1} (سختی: ${e.difficulty ?? "نامشخص"}):\n${e.question_text}\n${e.options
              .map((o) => `- ${o.text}${o.is_correct ? "  ← صحیح" : ""}`)
              .join("\n")}`,
        )
        .join("\n\n")
    : "نمونه‌ای موجود نیست.";

  const prompt = [
    `دسته: ${input.categoryName ?? "نامشخص"}`,
    `درس: ${input.subjectName ?? "نامشخص"}`,
    `موضوع درخواستی: ${input.topic}`,
    `تعداد سوال درخواستی: ${input.count}`,
    "",
    "نمونه‌های واقعی برای هماهنگی سبک و سطح دشواری:",
    examplesText,
  ].join("\n");

  const raw = (await generateAdminJson(SYSTEM, prompt)) as Record<string, unknown>;
  const list = Array.isArray(raw["questions"]) ? (raw["questions"] as unknown[]) : [];
  if (list.length === 0) throw new Error("هوش مصنوعی سوالی تولید نکرد.");

  const DIFFICULTIES = ["easy", "medium", "hard"] as const;

  return list.slice(0, input.count).map((item) => {
    const q = item as Record<string, unknown>;
    const optionsRaw = Array.isArray(q["options"]) ? (q["options"] as unknown[]) : [];
    const options = optionsRaw.map((o) => {
      const opt = o as Record<string, unknown>;
      return {
        option_text: String(opt["option_text"] ?? "").slice(0, 1000),
        is_correct: Boolean(opt["is_correct"]),
      };
    });
    if (options.length !== 4) throw new Error("خروجی هوش مصنوعی باید دقیقاً ۴ گزینه داشته باشد.");
    if (options.filter((o) => o.is_correct).length !== 1) {
      throw new Error("خروجی هوش مصنوعی باید دقیقاً یک گزینه صحیح داشته باشد.");
    }
    const difficulty = String(q["difficulty"] ?? "medium");
    return {
      question_text: String(q["question_text"] ?? "").slice(0, 4000),
      difficulty: (DIFFICULTIES as readonly string[]).includes(difficulty)
        ? (difficulty as AiQuestionGenerated["difficulty"])
        : "medium",
      options,
      explanation: String(q["explanation"] ?? "").slice(0, 4000),
    };
  });
}
