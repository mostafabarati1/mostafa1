const faDate = new Intl.DateTimeFormat("fa-IR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const faDateTime = new Intl.DateTimeFormat("fa-IR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return faDate.format(d);
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return faDateTime.format(d);
}

export function formatNumber(value?: number | string | null, digits = 0) {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: digits }).format(n);
}

export function formatPercent(value?: number | null, digits = 0) {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return "—";
  return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: digits }).format(n * 100)}٪`;
}

export function formatPrice(value?: number | string | null, currency = "تومان") {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return "—";
  if (n === 0) return "رایگان";
  return `${formatNumber(n)} ${currency}`;
}

export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (v: number) => String(v).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

const AUTH_ERRORS: Record<string, string> = {
  "Invalid login credentials": "ایمیل یا رمز عبور اشتباه است.",
  "Email not confirmed": "ایمیل شما هنوز تأیید نشده است. لطفاً صندوق ورودی خود را بررسی کنید.",
  "User already registered": "این ایمیل قبلاً ثبت شده است.",
  "Password should be at least 6 characters": "رمز عبور باید حداقل ۶ کاراکتر باشد.",
  "Unable to validate email address: invalid format": "قالب ایمیل معتبر نیست.",
  "New password should be different from the old password":
    "رمز جدید باید با رمز قبلی متفاوت باشد.",
};

const DB_ERRORS: Array<[string, string]> = [
  ["forbidden", "شما اجازه دسترسی به این بخش را ندارید."],
  ["not authenticated", "برای ادامه باید وارد حساب کاربری شوید."],
  ["subscription required", "برای شرکت در این آزمون نیاز به اشتراک فعال دارید."],
  [
    "daily attempt limit reached",
    "شما امروز در این آزمون شرکت کرده‌اید؛ هر کاربر روزی یک بار می‌تواند در هر آزمون شرکت کند. فردا دوباره تلاش کنید.",
  ],
  ["max attempts reached", "سقف مجاز شرکت در این آزمون تکمیل شده است."],
  ["attempt expired", "زمان این آزمون به پایان رسیده است."],
  ["attempt is not active", "این آزمون دیگر فعال نیست."],
  ["attempt not submitted", "این آزمون هنوز ثبت نهایی نشده است."],
  ["attempt not found", "آزمون موردنظر یافت نشد."],
  ["exam not found", "آزمون موردنظر یافت نشد."],
  ["plan not found", "پلن انتخابی یافت نشد."],
  ["no_questions_for_exam", "برای این آزمون سوال تمرینی فعالی ثبت نشده است."],
  ["no_questions", "با این فیلترها سوالی برای تمرین پیدا نشد؛ فیلترها را تغییر دهید."],
  ["session_finished", "این جلسه تمرین پایان یافته است."],
  ["invalid_question", "این سوال بخشی از جلسه تمرین شما نیست."],
  ["unauthorized", "برای ادامه باید وارد حساب کاربری شوید."],
  ["not_found", "موردی که دنبال آن هستید یافت نشد."],
  ["duplicate key", "این مقدار تکراری است."],
  ["violates row-level security", "دسترسی لازم برای این عملیات را ندارید."],
  [
    "violates foreign key constraint",
    "حساب شما هنوز تکمیل نشده است؛ لطفاً یک‌بار خارج شده و دوباره وارد شوید.",
  ],
  ["permission denied for function can_view_exam", "دسترسی لازم برای مشاهده این آزمون را ندارید."],
  ["permission denied for function", "دسترسی لازم برای این عملیات را ندارید."],
  ["permission denied for table", "دسترسی لازم برای این عملیات را ندارید."],
];

export function humanizeError(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "خطای ناشناخته";
  if (AUTH_ERRORS[raw]) return AUTH_ERRORS[raw];
  if (isOfflineError(raw)) return "شما آفلاین هستید؛ ارتباط با سرور برقرار نشد.";
  const lower = raw.toLowerCase();

  for (const [needle, fa] of DB_ERRORS) {
    if (lower.includes(needle)) return fa;
  }
  return raw;
}

/** تشخیص خطاهای قطع ارتباط با سرور/دیتابیس (آفلاین بودن). */
export function isOfflineError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const raw =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "";
  const lower = raw.toLowerCase();
  return (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network error") ||
    lower.includes("network request failed") ||
    lower.includes("load failed") ||
    lower.includes("fetch failed") ||
    lower.includes("err_internet_disconnected") ||
    lower.includes("err_network") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("etimedout") ||
    lower.includes("timeout") ||
    lower.includes("connection closed") ||
    lower.includes("connection refused") ||
    lower.includes("service unavailable") ||
    lower.includes("upstream connect error") ||
    lower.includes("gateway timeout")
  );
}
