/**
 * تولید پاسخ تشریحی سوال با هوش مصنوعی (فقط سمت سرور).
 * provider/model/کلید فقط از لایهٔ مرکزی env-driven خوانده می‌شود و کلید هرگز به مرورگر نمی‌رسد.
 */
import { aiFetch, getChatModel, resolveAiConfig } from "./ai-gateway.server";

/** مدل فعال تولید پاسخ تشریحی؛ فقط از پیکربندی مرکزی env-driven. */
export function getExplanationModel(): string {
  return getChatModel();
}
const SYSTEM_PROMPT = `تو یک مدرس فارسی‌زبان آزمون‌های استخدامی هستی.
وظیفه: برای سوال چهارگزینه‌ای داده‌شده، «پاسخ تشریحی کامل» فارسی بنویس.
قواعد سخت:
- گزینه صحیح دقیقاً همان است که در داده ورودی مشخص شده؛ آن را تغییر نده و با آن مخالفت نکن.
- ابتدا پاسخ درست را در یک جمله اعلام کن، سپس دلیل درستی آن را گام‌به‌گام توضیح بده.
- سپس در بخشی جداگانه توضیح بده چرا هر گزینه نادرست، نادرست است.
- در پایان یک «نکته کلیدی» کوتاه برای یادگیری بنویس.
- خروجی فقط متن مارک‌داون ساده فارسی باشد (بدون HTML، بدون JSON، بدون بلوک کد).
- چیزی از خودت اضافه نکن که با متن سوال در تضاد باشد؛ کوتاه، دقیق و آموزشی بنویس.`;
export type ExplanationInput = {
  questionText: string;
  options: { text: string; isCorrect: boolean }[];
  subject?: string | null;
  category?: string | null;
  difficulty?: string | null;
};
function buildUserPrompt(input: ExplanationInput): string {
  const lines = [
    `درس: ${input.subject ?? "نامشخص"}`,
    `دسته‌بندی: ${input.category ?? "نامشخص"}`,
    `سطح دشواری: ${input.difficulty ?? "نامشخص"}`,
    "",
    `صورت سوال: ${input.questionText}`,
    "",
    "گزینه‌ها:",
    ...input.options.map((o, i) => `${i + 1}) ${o.text}${o.isCorrect ? "  ← گزینه صحیح" : ""}`),
    "",
    "پاسخ تشریحی کامل فارسی بنویس.",
  ];
  return lines.join("\n");
}
export async function generateQuestionExplanation(
  input: ExplanationInput,
): Promise<{ explanation: string; model: string }> {
  const config = resolveAiConfig();
  const response = await aiFetch(
    "/chat/completions",
    {
      model: config.chatModel,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
    },
    config,
  );
  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429) {
      throw new Error("محدودیت درخواست هوش مصنوعی. کمی بعد دوباره تلاش کنید.");
    }
    if (response.status === 402) {
      throw new Error("اعتبار سرویس هوش مصنوعی کافی نیست.");
    }
    throw new Error(`خطا در تولید پاسخ تشریحی (${response.status}): ${body.slice(0, 200)}`);
  }
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("پاسخ تشریحی تولید نشد. دوباره تلاش کنید.");
  return { explanation: text, model: config.chatModel };
}
