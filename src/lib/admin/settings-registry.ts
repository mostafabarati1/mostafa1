/**
 * Typed schema for the settings editor. Known keys get a real input with
 * validation instead of a free-form JSON textarea; unknown keys fall back to
 * JSON so nothing in the table becomes unmanageable.
 */
export type SettingField = {
  key: string;
  label: string;
  help?: string;
  kind: "text" | "number" | "boolean" | "email" | "phone" | "url" | "select" | "json";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  maxLength?: number;
};

export const SETTING_FIELDS: SettingField[] = [
  { key: "site_name", label: "نام سایت", kind: "text", maxLength: 80 },
  { key: "support_email", label: "ایمیل پشتیبانی", kind: "email", maxLength: 120 },
  { key: "support_phone", label: "تلفن پشتیبانی", kind: "phone", maxLength: 20 },
  {
    key: "default_currency",
    label: "واحد پول پیش‌فرض",
    kind: "select",
    options: [
      { value: "IRT", label: "تومان (IRT)" },
      { value: "IRR", label: "ریال (IRR)" },
    ],
  },
  {
    key: "trial_days",
    label: "مدت دوره آزمایشی (روز)",
    kind: "number",
    min: 0,
    max: 365,
    help: "با صفر، دوره آزمایشی غیرفعال می‌شود.",
  },
  {
    key: "free_exam_quota",
    label: "سهمیه آزمون رایگان",
    kind: "number",
    min: 0,
    max: 1000,
  },
  {
    key: "social_instagram",
    label: "اینستاگرام",
    kind: "url",
    help: "نشانی کامل صفحه؛ خالی بگذارید تا نمایش داده نشود.",
  },
  { key: "social_telegram", label: "تلگرام", kind: "url" },
  { key: "social_whatsapp", label: "واتس‌اپ", kind: "url" },
  { key: "social_linkedin", label: "لینکدین", kind: "url" },
  { key: "social_facebook", label: "فیسبوک", kind: "url" },
  { key: "social_x", label: "ایکس (توییتر)", kind: "url" },
];

export function fieldFor(key: string): SettingField {
  return SETTING_FIELDS.find((f) => f.key === key) ?? { key, label: key, kind: "json" };
}

/** Keys whose values must never be edited or displayed in the settings page. */
export const SECRET_KEY_PATTERN = /(api_key|secret|token|password|private_key|webhook)/i;

export type ValidationResult = { ok: true; value: unknown } | { ok: false; error: string };

export function validateSetting(field: SettingField, raw: string): ValidationResult {
  const text = raw.trim();
  switch (field.kind) {
    case "text": {
      if (!text) return { ok: false, error: "مقدار نمی‌تواند خالی باشد" };
      if (field.maxLength && text.length > field.maxLength)
        return { ok: false, error: `حداکثر ${field.maxLength} کاراکتر` };
      return { ok: true, value: text };
    }
    case "email": {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text))
        return { ok: false, error: "ایمیل معتبر نیست" };
      return { ok: true, value: text };
    }
    case "url": {
      if (!text) return { ok: true, value: "" };
      if (!/^https?:\/\/[^\s]+\.[^\s]{2,}$/.test(text))
        return { ok: false, error: "نشانی باید با http:// یا https:// شروع شود" };
      if (text.length > 300) return { ok: false, error: "حداکثر ۳۰۰ کاراکتر" };
      return { ok: true, value: text };
    }
    case "phone": {
      if (!/^0?\d{8,14}$/.test(text)) return { ok: false, error: "شماره تماس معتبر نیست" };
      return { ok: true, value: text };
    }
    case "number": {
      const n = Number(text);
      if (!Number.isFinite(n)) return { ok: false, error: "عدد معتبر وارد کنید" };
      if (field.min != null && n < field.min) return { ok: false, error: `حداقل ${field.min}` };
      if (field.max != null && n > field.max) return { ok: false, error: `حداکثر ${field.max}` };
      return { ok: true, value: n };
    }
    case "boolean":
      return { ok: true, value: text === "true" };
    case "select": {
      if (!field.options?.some((o) => o.value === text))
        return { ok: false, error: "گزینه معتبر نیست" };
      return { ok: true, value: text };
    }
    case "json":
    default: {
      try {
        return { ok: true, value: JSON.parse(text) };
      } catch {
        return { ok: false, error: "JSON معتبر نیست" };
      }
    }
  }
}

export function toEditableString(field: SettingField, value: unknown): string {
  if (field.kind === "json") return JSON.stringify(value ?? null, null, 2);
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
