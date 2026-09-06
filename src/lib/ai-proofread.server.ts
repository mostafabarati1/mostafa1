/** بازبینی نگارشی فارسی (RTL) صورت سوال و گزینه‌ها — فقط سمت سرور. */
import { generateAdminJson } from "@/lib/ai-admin/gapgpt.server";

const SYSTEM = `تو ویراستار فارسی متون آموزشی هستی.
متن سوال چهارگزینه‌ای و گزینه‌ها را از نظر نگارش فارسی بازبینی کن:
نیم‌فاصله، «ی/ک» فارسی، فاصله‌گذاری نشانه‌ها، اعداد فارسی، غلط املایی و جمله‌بندی.
خروجی فقط JSON:
{"issues":[{"field":"question|option","index":0,"type":"نوع مشکل","detail":"توضیح کوتاه"}],
 "suggested_question":"متن اصلاح‌شده سوال",
 "suggested_options":["متن اصلاح‌شده گزینه ۱", "..."]}
- معنی و محتوای علمی را تغییر نده؛ فقط نگارش را اصلاح کن.
- ترتیب و تعداد گزینه‌ها باید دقیقاً حفظ شود.
- اگر متنی مشکلی ندارد، همان متن اصلی را بازگردان.`;

export type ProofreadInput = {
  questionText: string;
  options: string[];
};

export type ProofreadIssue = {
  field: "question" | "option";
  index: number;
  type: string;
  detail: string;
};

export type ProofreadResult = {
  issues: ProofreadIssue[];
  suggested_question: string;
  suggested_options: string[];
};

export async function proofreadQuestionContent(input: ProofreadInput): Promise<ProofreadResult> {
  const prompt = [
    `صورت سوال: ${input.questionText}`,
    "گزینه‌ها:",
    ...input.options.map((o, i) => `${i + 1}) ${o}`),
  ].join("\n");

  const raw = (await generateAdminJson(SYSTEM, prompt)) as Record<string, unknown>;
  const rawIssues = Array.isArray(raw["issues"])
    ? (raw["issues"] as Record<string, unknown>[])
    : [];
  const rawOptions = Array.isArray(raw["suggested_options"]) ? raw["suggested_options"] : [];

  return {
    issues: rawIssues.slice(0, 50).map((i) => ({
      field: i["field"] === "option" ? "option" : "question",
      index: Number(i["index"] ?? 0) || 0,
      type: String(i["type"] ?? "نگارشی").slice(0, 80),
      detail: String(i["detail"] ?? "").slice(0, 300),
    })),
    suggested_question: String(raw["suggested_question"] ?? input.questionText),
    suggested_options: input.options.map((original, i) => {
      const value = rawOptions[i];
      return typeof value === "string" && value.trim() ? value.trim() : original;
    }),
  };
}
