/** ابزارهای مشترک صفحه جزئیات کاربر (برچسب‌های فارسی و پاک‌سازی داده حساس). */

export const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  active: "فعال",
  suspended: "مسدود",
  banned: "مسدود دائم",
  inactive: "غیرفعال",
};

export const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  active: "فعال",
  trial: "آزمایشی",
  expired: "منقضی",
  cancelled: "لغو شده",
  pending: "در انتظار",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  paid: "پرداخت شده",
  verified: "تأیید شده",
  pending: "در انتظار",
  failed: "ناموفق",
  refunded: "بازگشت داده شده",
  cancelled: "لغو شده",
};

export const ATTEMPT_STATUS_LABEL: Record<string, string> = {
  in_progress: "در حال انجام",
  submitted: "ثبت نهایی",
  expired: "منقضی",
  abandoned: "رها شده",
};

export const REPORT_STATUS_LABEL: Record<string, string> = {
  open: "باز",
  reviewing: "در حال بررسی",
  resolved: "رسیدگی شده",
  rejected: "رد شده",
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  set_role: "تغییر نقش",
  set_status: "تغییر وضعیت حساب",
  grant: "اعطای اشتراک",
  cancel: "لغو اشتراک",
  set_subscription_status: "تغییر وضعیت اشتراک",
  create: "ایجاد",
  update: "ویرایش",
  delete: "حذف",
};

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  profiles: "پروفایل",
  user_roles: "نقش‌ها",
  subscriptions: "اشتراک",
  payments: "پرداخت",
  exams: "آزمون",
  questions: "سوال",
};

export function labelOf(map: Record<string, string>, value?: string | null) {
  if (!value) return "—";
  return map[value] ?? value;
}

const SENSITIVE_KEY =
  /(token|secret|password|passwd|authorization|api[_-]?key|card|pan|iban|cvv|sheba|otp|signature)/i;

/** مقادیر حساس در متادیتای ممیزی پیش از نمایش mask می‌شوند. */
export function maskSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "•••" : maskSensitive(v);
    }
    return out;
  }
  return value;
}

/** نمایش امن شناسه تراکنش/کارت در فهرست‌ها. */
export function maskRef(value?: string | null) {
  if (!value) return "—";
  if (value.length <= 6) return value;
  return `${value.slice(0, 3)}…${value.slice(-3)}`;
}
