import { humanizeError } from "@/lib/format";

/** Server error codes raised by admin RPCs, mapped to operator-facing Persian. */
const CODE_MESSAGES: Record<string, string> = {
  forbidden: "دسترسی مدیر لازم است",
  reason_required: "ثبت دلیل الزامی است",
  reference_required: "کد پیگیری الزامی است",
  invalid_plan_title: "عنوان پلن معتبر نیست",
  invalid_plan_price: "قیمت پلن معتبر نیست",
  invalid_plan_duration: "مدت پلن باید بین ۱ تا ۶۰ ماه باشد",
  invalid_plan_currency: "واحد پول معتبر نیست",
  invalid_plan_quota: "سهمیه معتبر نیست",
  invalid_plan_order: "ترتیب نمایش معتبر نیست",
  invalid_plan_features: "فهرست امکانات معتبر نیست",
  invalid_setting_key: "کلید تنظیم معتبر نیست",
  invalid_setting_value: "مقدار تنظیم معتبر نیست",
  secret_not_allowed_here: "کلیدهای محرمانه از این بخش قابل ویرایش نیستند",
  setting_conflict: "این تنظیم توسط مدیر دیگری تغییر کرده است؛ صفحه را تازه کنید",
  payment_already_verified: "این پرداخت قبلاً تأیید شده است",
  payment_not_verifiable: "این پرداخت قابل تأیید نیست",
  payment_not_refundable: "فقط پرداخت‌های موفق قابل بازپرداخت هستند",
  payment_already_refunded: "کل مبلغ این پرداخت بازگردانده شده است",
  refund_in_progress: "یک بازپرداخت در حال پردازش برای این تراکنش وجود دارد",
  refund_amount_exceeds_remaining: "مبلغ بازپرداخت از باقیمانده بیشتر است",
  invalid_refund_amount: "مبلغ بازپرداخت معتبر نیست",
  idempotency_key_required: "کلید یکتای عملیات ارسال نشده است",
  provider_reference_required: "برای این درگاه، ثبت کد پیگیری بانکی الزامی است",
  refund_not_supported_for_gateway: "بازپرداخت خودکار برای این درگاه پشتیبانی نمی‌شود",
  not_found: "موردی یافت نشد",
  "plan not found": "پلن یافت نشد",
  "payment not found": "پرداخت یافت نشد",
  "refund not found": "درخواست بازپرداخت یافت نشد",
};

export function adminError(error: unknown): string {
  const raw =
    typeof error === "string" ? error : ((error as { message?: string } | null)?.message ?? "");
  for (const [code, message] of Object.entries(CODE_MESSAGES)) {
    if (raw.includes(code)) return message;
  }
  return humanizeError(error);
}
