/** نوع‌های مشترک تشخیص تکرار معنایی سوالات (کلاینت و سرور). */

export type SemanticDedupRowInput = {
  row_number: number;
  question_text: string;
  options: string[];
};

export type SemanticDuplicateSource = "database" | "batch";

export type SemanticDuplicateMatch = {
  row_number: number;
  /** شناسه سوال موجود در بانک؛ در تطبیق درون همان فایل (batch) مقدار ندارد. */
  existing_question_id: string | null;
  /** شماره سطر دیگر در همان فایل؛ فقط برای منبع batch پر می‌شود. */
  matched_row_number: number | null;
  existing_question_text: string;
  similarity: number;
  source: SemanticDuplicateSource;
};

export type SemanticDedupResult = {
  /** اگر false باشد، ویژگی به هر دلیلی غیرفعال بوده و روی روند اصلی ورود بی‌اثر است. */
  enabled: boolean;
  reason: string | null;
  matches: SemanticDuplicateMatch[];
  threshold: number;
  model: string;
};
