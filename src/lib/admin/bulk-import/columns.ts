/**
 * تعریف ستون‌های استاندارد ورود گروهی سوالات.
 * این تعریف مرجع مشترک «قالب نمونه»، «نگاشت ستون‌ها» و «اعتبارسنجی» است.
 */

export type ImportColumn = {
  key: string;
  label: string;
  required: boolean;
  hint: string;
  /** نام‌های رایجی که هنگام نگاشت خودکار شناسایی می‌شوند */
  aliases: string[];
};

export const MAX_OPTIONS = 6;

export const IMPORT_COLUMNS: ImportColumn[] = [
  {
    key: "question_text",
    label: "متن سوال",
    required: true,
    hint: "متن کامل صورت سوال (حداکثر ۵۰۰۰ کاراکتر)",
    aliases: ["question", "سوال", "متن سوال", "صورت سوال", "question_text"],
  },
  ...Array.from({ length: MAX_OPTIONS }, (_, i) => ({
    key: `option_${i + 1}`,
    label: `گزینه ${i + 1}`,
    required: i < 2,
    hint: i < 2 ? "الزامی — حداقل دو گزینه لازم است" : "اختیاری",
    aliases: [`option${i + 1}`, `option_${i + 1}`, `گزینه ${i + 1}`, `گزینه${i + 1}`],
  })),
  {
    key: "correct_option",
    label: "گزینه صحیح",
    required: true,
    hint: "شماره گزینه صحیح (۱ تا ۶). برای چند پاسخی با کاما: 1,3",
    aliases: ["answer", "correct", "پاسخ", "جواب", "گزینه صحیح", "correct_option"],
  },
  {
    key: "difficulty",
    label: "سطح سختی",
    required: false,
    hint: "easy | medium | hard — پیش‌فرض medium",
    aliases: ["difficulty", "سختی", "سطح", "سطح سختی"],
  },
  {
    key: "score",
    label: "نمره",
    required: false,
    hint: "عدد مثبت — پیش‌فرض ۱",
    aliases: ["score", "نمره", "بارم"],
  },
  {
    key: "category",
    label: "دسته‌بندی",
    required: false,
    hint: "نام دسته‌بندی؛ در صورت خالی بودن از مقدار پیش‌فرض ویزارد استفاده می‌شود",
    aliases: ["category", "دسته", "دسته‌بندی", "دسته بندی", "category_name"],
  },
  {
    key: "subject",
    label: "درس",
    required: false,
    hint: "نام درس؛ در صورت خالی بودن از مقدار پیش‌فرض ویزارد استفاده می‌شود",
    aliases: ["subject", "درس", "subject_name"],
  },
  {
    key: "organization",
    label: "سازمان",
    required: false,
    hint: "نام سازمان؛ در صورت خالی بودن از مقدار پیش‌فرض ویزارد استفاده می‌شود",
    aliases: ["organization", "org", "سازمان", "ارگان", "organization_name"],
  },
  {
    key: "explanation",
    label: "پاسخ تشریحی",
    required: false,
    hint: "توضیح یا پاسخ تشریحی سوال",
    aliases: ["explanation", "تشریح", "پاسخ تشریحی", "توضیح"],
  },
  {
    key: "image_url",
    label: "نشانی تصویر",
    required: false,
    hint: "آدرس تصویر پیوست سوال",
    aliases: ["image", "image_url", "تصویر", "عکس"],
  },
  {
    key: "external_id",
    label: "شناسه خارجی",
    required: false,
    hint: "شناسه سوال در سامانه مبدا (برای پیگیری)",
    aliases: ["external_id", "code", "شناسه", "کد"],
  },
];

export const REQUIRED_KEYS = IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.key);

const SAMPLE_ROW: Record<string, string> = {
  question_text: "پایتخت ایران کدام شهر است؟",
  option_1: "تهران",
  option_2: "اصفهان",
  option_3: "شیراز",
  option_4: "تبریز",
  option_5: "",
  option_6: "",
  correct_option: "1",
  difficulty: "easy",
  score: "1",
  category: "",
  subject: "",
  explanation: "تهران از سال ۱۲۰۰ خورشیدی پایتخت ایران است.",
  image_url: "",
  external_id: "Q-1001",
};

export function templateHeaders(): string[] {
  return IMPORT_COLUMNS.map((c) => c.key);
}

export function templateSampleRow(): Record<string, string> {
  return { ...SAMPLE_ROW };
}

/** ساخت محتوای قالب CSV با BOM برای نمایش صحیح فارسی در اکسل */
export function buildCsvTemplate(): string {
  const headers = templateHeaders();
  const row = templateSampleRow();
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `\uFEFF${headers.join(",")}\n${headers.map((h) => escape(row[h] ?? "")).join(",")}\n`;
}

export function buildJsonTemplate(): string {
  return JSON.stringify([templateSampleRow()], null, 2);
}

export function downloadBlob(content: BlobPart, fileName: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
