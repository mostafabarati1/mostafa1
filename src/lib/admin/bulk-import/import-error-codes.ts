/**
 * کدهای خطای استاندارد لایه‌ی توسعه‌یافته‌ی ورود گروهی.
 * این فایل افزودنی است و هیچ‌کدام از کدهای قبلی (`required`، `invalid`، ...) را حذف نمی‌کند.
 */

export const IMPORT_ERROR_CODES = {
  REQUIRED_FIELD: "REQUIRED_FIELD",
  INVALID_JSON_ROW: "INVALID_JSON_ROW",
  INVALID_NUMBER: "INVALID_NUMBER",
  INVALID_CORRECT_OPTION: "INVALID_CORRECT_OPTION",
  DUPLICATE_OPTION_TEXT: "DUPLICATE_OPTION_TEXT",
  MIN_OPTIONS: "MIN_OPTIONS",
  CATEGORY_NOT_FOUND: "CATEGORY_NOT_FOUND",
  SUBJECT_NOT_FOUND: "SUBJECT_NOT_FOUND",
  EXAM_NOT_FOUND: "EXAM_NOT_FOUND",
  INVALID_URL: "INVALID_URL",
  DUPLICATE_IN_FILE: "DUPLICATE_IN_FILE",
  DUPLICATE_IN_DATABASE: "DUPLICATE_IN_DATABASE",
  INVALID_DIFFICULTY: "INVALID_DIFFICULTY",
  INVALID_STATUS: "INVALID_STATUS",
  INVALID_SCORE: "INVALID_SCORE",
  TOO_LONG: "TOO_LONG",
  EMPTY_OPTION_GAP: "EMPTY_OPTION_GAP",
} as const;

export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[keyof typeof IMPORT_ERROR_CODES];

/** پیام فارسی هر کد خطا برای نمایش در جدول‌ها و گزارش‌ها */
export const IMPORT_ERROR_MESSAGES_FA: Record<ImportErrorCode, string> = {
  REQUIRED_FIELD: "این مقدار الزامی است.",
  INVALID_JSON_ROW: "هر عضو آرایه JSON باید یک آبجکت باشد.",
  INVALID_NUMBER: "مقدار عددی نامعتبر است.",
  INVALID_CORRECT_OPTION: "شماره گزینه صحیح با گزینه‌های موجود هم‌خوانی ندارد.",
  DUPLICATE_OPTION_TEXT: "متن گزینه‌ها تکراری است.",
  MIN_OPTIONS: "حداقل دو گزینه لازم است.",
  CATEGORY_NOT_FOUND: "دسته‌بندی یافت نشد.",
  SUBJECT_NOT_FOUND: "درس یافت نشد.",
  EXAM_NOT_FOUND: "آزمون یافت نشد.",
  INVALID_URL: "نشانی تصویر معتبر نیست.",
  DUPLICATE_IN_FILE: "این سوال در همین فایل تکراری است.",
  DUPLICATE_IN_DATABASE: "این سوال از قبل در بانک سوال وجود دارد.",
  INVALID_DIFFICULTY: "سطح سختی باید easy، medium یا hard باشد.",
  INVALID_STATUS: "وضعیت باید active، draft یا inactive باشد.",
  INVALID_SCORE: "نمره باید عددی مثبت باشد.",
  TOO_LONG: "طول مقدار از حد مجاز بیشتر است.",
  EMPTY_OPTION_GAP: "بین گزینه‌های پرشده، گزینه خالی وجود دارد.",
};

export function importErrorMessage(code: string, fallback = "مقدار نامعتبر است."): string {
  return IMPORT_ERROR_MESSAGES_FA[code as ImportErrorCode] ?? fallback;
}
