/** تولید متن کمپین پیامکی/ایمیلی با هوش مصنوعی (فقط سمت سرور). */
import { generateAdminJson } from "@/lib/ai-admin/gapgpt.server";

export const SMS_COPY_MAX = 300;

const SYSTEM_SMS = `تو کپی‌رایتر فارسی‌زبان سامانه آموزشی «همراه استخدام» هستی.
یک متن پیامک تبلیغاتی/اطلاع‌رسانی کوتاه و محترمانه بنویس.
خروجی فقط JSON: {"text":"متن پیامک"}
- حداکثر ۳۰۰ کاراکتر، بدون ایموجی، بدون لینک ساختگی.
- لحن فارسی رسمی و روان؛ بدون وعده غیرواقعی.`;

const SYSTEM_EMAIL = `تو کپی‌رایتر فارسی‌زبان سامانه آموزشی «همراه استخدام» هستی.
یک ایمیل کوتاه فارسی بنویس.
خروجی فقط JSON: {"subject":"موضوع","body":"متن ایمیل"}
- موضوع حداکثر ۸۰ کاراکتر.
- متن ساده و بدون HTML، حداکثر ۶ پاراگراف کوتاه.`;

export type CopyInput = {
  kind: "sms" | "email";
  topic: string;
  tone?: string | null;
  audience?: string | null;
  notes?: string | null;
};

export type CopyResult = { text: string | null; subject: string | null; body: string | null };

export async function generateCampaignCopyText(input: CopyInput): Promise<CopyResult> {
  const prompt = [
    `موضوع: ${input.topic}`,
    `لحن: ${input.tone?.trim() || "رسمی و صمیمی"}`,
    `مخاطب: ${input.audience?.trim() || "کاربران سامانه"}`,
    input.notes?.trim() ? `نکات تکمیلی: ${input.notes.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = (await generateAdminJson(
    input.kind === "sms" ? SYSTEM_SMS : SYSTEM_EMAIL,
    prompt,
  )) as Record<string, unknown>;

  if (input.kind === "sms") {
    const text = String(raw["text"] ?? "").trim();
    if (!text) throw new Error("متن پیامک تولید نشد.");
    return { text: text.slice(0, SMS_COPY_MAX), subject: null, body: null };
  }

  const subject = String(raw["subject"] ?? "").trim();
  const body = String(raw["body"] ?? "").trim();
  if (!subject && !body) throw new Error("متن ایمیل تولید نشد.");
  return { text: null, subject: subject.slice(0, 160), body };
}
