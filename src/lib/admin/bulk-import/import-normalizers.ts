/**
 * نرمال‌سازهای مشترک لایه‌ی توسعه‌یافته‌ی ورود گروهی.
 * تمام توابع خالص (pure) هستند تا تست واحد ساده باشد.
 */

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** تبدیل ارقام فارسی و عربی به ارقام انگلیسی؛ جداکننده‌ی هزارگان فارسی هم حذف می‌شود. */
export function toEnglishDigits(value: string): string {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/\u066B/g, ".")
    .replace(/\u066C/g, "");
}

/** یکسان‌سازی حروف عربی/فارسی، نیم‌فاصله و فاصله‌های تکراری برای مقایسه‌ی نام‌ها */
export function normalizeName(value: string): string {
  return String(value ?? "")
    .replace(/[ىي]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[\u200c\u200f\u200e]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** حذف BOM از ابتدای متن فایل */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * تبدیل مقدار خام به عدد.
 * مقدار صفر معتبر است و به null تبدیل نمی‌شود؛ مقدارهای غیرعددی null برمی‌گردانند.
 */
export function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = toEnglishDigits(String(value))
    .replace(/[,،\s]/g, "")
    .trim();
  if (raw === "") return null;
  if (!/^[-+]?\d+(\.\d+)?$/.test(raw)) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "بله", "درست", "صحیح", "on"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "خیر", "نادرست", "غلط", "off"]);

/** تبدیل امن مقدارهای متنی به boolean؛ مقدار ناشناخته null برمی‌گردد (نه false). */
export function parseBoolean(value: string | boolean | null | undefined): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  const raw = normalizeName(toEnglishDigits(String(value)));
  if (raw === "") return null;
  if (TRUE_VALUES.has(raw)) return true;
  if (FALSE_VALUES.has(raw)) return false;
  return null;
}

/** استخراج شماره‌های گزینه‌ی صحیح؛ در صورت وجود مقدار غیرعددی، invalid برمی‌گردد. */
export function parseCorrectOptions(raw: string): { values: number[]; invalid: boolean } {
  const text = toEnglishDigits(String(raw ?? "")).trim();
  if (text === "") return { values: [], invalid: false };
  const parts = text
    .split(/[,،|/؛;\s]+/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
  const values: number[] = [];
  let invalid = false;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      invalid = true;
      continue;
    }
    const num = Number(part);
    if (!values.includes(num)) values.push(num);
  }
  return { values, invalid };
}

/** تولید slug از نام فارسی یا انگلیسی */
export function slugify(value: string): string {
  const base = toEnglishDigits(String(value ?? ""))
    .replace(/[\u200c]/g, "-")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || `item-${Date.now().toString(36)}`;
}

/** بررسی معتبر بودن نشانی تصویر (فقط http/https یا مسیر نسبی) */
export function isValidImageUrl(value: string): boolean {
  const raw = String(value ?? "").trim();
  if (raw === "") return true;
  if (raw.startsWith("/")) return true;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function truncate(value: string, max: number): string {
  const raw = String(value ?? "");
  return raw.length > max ? raw.slice(0, max) : raw;
}
