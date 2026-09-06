/** تحلیل هوشمند گزارش‌های سوال (فقط سمت سرور). */
import { generateAdminJson } from "@/lib/ai-admin/gapgpt.server";

const SYSTEM = `تو کارشناس کنترل کیفیت بانک سوال فارسی هستی.
گزارش کاربر درباره یک سوال چهارگزینه‌ای را بررسی کن.
خروجی فقط JSON:
{"category":"wrong_answer|typo|duplicate|unclear|out_of_scope|other",
 "severity":"low|medium|high",
 "suggested_status":"pending|reviewing|resolved|rejected",
 "summary":"خلاصه فارسی حداکثر دو جمله",
 "suggested_note":"یادداشت پیشنهادی مدیر به فارسی"}
- فقط پیشنهاد بده؛ تصمیم نهایی با مدیر است.
- اگر گزارش بی‌پایه به نظر می‌رسد، suggested_status را rejected بگذار.`;

export type TriageInput = {
  reason: string;
  description: string | null;
  questionText: string;
  difficulty: string | null;
  options: { text: string; is_correct: boolean }[];
};

export type TriageResult = {
  category: string;
  severity: "low" | "medium" | "high";
  suggested_status: "pending" | "reviewing" | "resolved" | "rejected";
  summary: string;
  suggested_note: string;
};

const SEVERITIES = ["low", "medium", "high"] as const;
const STATUSES = ["pending", "reviewing", "resolved", "rejected"] as const;

export async function triageReport(input: TriageInput): Promise<TriageResult> {
  const prompt = [
    `دلیل گزارش: ${input.reason}`,
    `توضیحات گزارش‌دهنده: ${input.description ?? "—"}`,
    `سطح دشواری سوال: ${input.difficulty ?? "نامشخص"}`,
    "",
    `صورت سوال: ${input.questionText}`,
    "گزینه‌ها:",
    ...input.options.map((o, i) => `${i + 1}) ${o.text}${o.is_correct ? "  ← صحیح" : ""}`),
  ].join("\n");

  const raw = (await generateAdminJson(SYSTEM, prompt)) as Record<string, unknown>;
  const severity = String(raw["severity"] ?? "medium");
  const status = String(raw["suggested_status"] ?? "pending");

  return {
    category: String(raw["category"] ?? "other").slice(0, 40),
    severity: (SEVERITIES as readonly string[]).includes(severity)
      ? (severity as TriageResult["severity"])
      : "medium",
    suggested_status: (STATUSES as readonly string[]).includes(status)
      ? (status as TriageResult["suggested_status"])
      : "pending",
    summary: String(raw["summary"] ?? "").slice(0, 600),
    suggested_note: String(raw["suggested_note"] ?? "").slice(0, 1000),
  };
}
