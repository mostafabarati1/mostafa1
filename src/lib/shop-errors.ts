/**
 * نگاشت خطاهای ماژول فروشگاه به پیام فارسی.
 * توجه: src/lib/format.ts دست‌نخورده می‌ماند؛ این فایل صرفاً افزودنی است.
 */

const SHOP_ERRORS: Array<[string, string]> = [
  ["insufficient stock", "موجودی کافی نیست."],
  ["cart empty", "سبد خرید شما خالی است."],
  ["product not found", "محصول یافت نشد."],
  ["coupon min purchase", "مبلغ سبد خرید برای استفاده از این کد تخفیف کافی نیست."],
  ["coupon exhausted", "ظرفیت استفاده از این کد تخفیف تکمیل شده است."],
  ["coupon expired", "کد تخفیف منقضی شده است."],
  ["coupon invalid", "کد تخفیف نامعتبر است."],
  ["order not found", "سفارش یافت نشد."],
  ["order forbidden", "این سفارش متعلق به شما نیست."],
  ["order not payable", "این سفارش قابل پرداخت نیست."],
  ["order not cancellable", "فقط سفارش‌های در انتظار پرداخت قابل لغو هستند."],
  ["order status transition not allowed", "تغییر وضعیت سفارش مجاز نیست."],
  ["category has products", "این دسته‌بندی دارای محصول است و حذف نمی‌شود."],
  ["coupon not found", "کد تخفیف یافت نشد."],
  ["payment not found", "پرداخت یافت نشد."],
  ["payment forbidden", "دسترسی به این پرداخت مجاز نیست."],
  ["not authenticated", "برای ادامه باید وارد حساب کاربری شوید."],
  ["forbidden", "شما اجازه دسترسی به این بخش را ندارید."],
  ["duplicate key", "این مقدار قبلاً ثبت شده است (اسلاگ یا کد تکراری)."],
];

/** پیام فارسی خطای فروشگاه؛ در صورت نبود نگاشت، پیام پیش‌فرض بازمی‌گردد. */
export function humanizeShopError(
  error: unknown,
  fallback = "خطایی رخ داد. دوباره تلاش کنید.",
): string {
  const raw =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message ?? "")
        : "";
  const lower = raw.toLowerCase();
  for (const [needle, message] of SHOP_ERRORS) {
    if (lower.includes(needle)) return message;
  }
  return raw ? raw : fallback;
}

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** اعتبارسنجی فایل تصویر برای آپلود در باکت shop-media. */
export function validateShopImage(file: File): string | null {
  if (!file.type.startsWith("image/")) return "فقط فایل تصویری مجاز است.";
  if (file.size > IMAGE_MAX_BYTES) return "حجم تصویر باید کمتر از ۵ مگابایت باشد.";
  return null;
}
