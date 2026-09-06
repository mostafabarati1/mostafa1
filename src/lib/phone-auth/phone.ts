import { z } from "zod";

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Converts Persian/Arabic digits to ASCII and strips separators. */
export function toAsciiDigits(value: string): string {
  return value
    .split("")
    .map((ch) => {
      const fa = FA_DIGITS.indexOf(ch);
      if (fa > -1) return String(fa);
      const ar = AR_DIGITS.indexOf(ch);
      if (ar > -1) return String(ar);
      return ch;
    })
    .join("")
    .replace(/[\s\-().]/g, "");
}

/**
 * Normalizes an Iranian mobile number to E.164 (+989xxxxxxxxx).
 * Accepts 09xxxxxxxxx, 9xxxxxxxxx, 0098..., +98...
 */
export function normalizeIranMobile(input: string): string | null {
  let v = toAsciiDigits(input.trim());
  if (v.startsWith("+")) v = v.slice(1);
  if (v.startsWith("0098")) v = v.slice(4);
  else if (v.startsWith("98")) v = v.slice(2);
  else if (v.startsWith("0")) v = v.slice(1);
  if (!/^9\d{9}$/.test(v)) return null;
  return `+98${v}`;
}

/** +989121234567 -> 09121234567 */
export function toLocalMobile(e164: string): string {
  return `0${e164.replace(/^\+98/, "")}`;
}

/** 0123456789 -> ۰۱۲۳۴۵۶۷۸۹ */
export function toPersianDigits(value: string): string {
  return value
    .split("")
    .map((ch) => {
      const d = parseInt(ch, 10);
      if (!Number.isNaN(d)) return FA_DIGITS[d];
      return ch;
    })
    .join("");
}

/** 09*****4567 for display */
export function maskMobile(e164: string): string {
  const local = toLocalMobile(e164);
  return `${local.slice(0, 4)}***${local.slice(-4)}`;
}

export const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(1, "شماره موبایل را وارد کنید.")
    .refine((v) => normalizeIranMobile(v) !== null, "شماره موبایل معتبر نیست (مثال: ۰۹۱۲۱۲۳۴۵۶۷)."),
});

export const otpSchema = z.object({
  code: z
    .string()
    .trim()
    .transform(toAsciiDigits)
    .refine((v) => /^\d{6}$/.test(v), "کد تأیید باید ۶ رقم باشد."),
  fullName: z.string().trim().optional(),
});

export const OTP_TTL_SECONDS = 120;
export const OTP_RESEND_SECONDS = 60;
