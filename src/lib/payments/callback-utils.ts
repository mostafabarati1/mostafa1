/**
 * کمکی‌های خالص کال‌بک پرداخت — بدون وابستگی به سرور تا قابل تست باشند.
 */

export type ResultStatus =
  "success" | "failed" | "cancelled" | "missing" | "not_found" | "pending" | "error";

/** وضعیت‌هایی که یعنی پرداخت قبلاً تسویه شده است (idempotency). */
export const SETTLED_STATUSES = ["paid", "verified", "completed"] as const;

export function isSettled(status: unknown): boolean {
  return SETTLED_STATUSES.includes(String(status) as (typeof SETTLED_STATUSES)[number]);
}

/** فقط کاراکترهای امن برای نمایش/قرار گرفتن در URL. */
export function sanitizeRefId(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const safe = raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  return safe || null;
}

/** Authority زرین‌پال: رشته الفبا-عددی با طول محدود. */
export function sanitizeAuthority(value: string | null | undefined): string | null {
  if (!value) return null;
  const safe = value.trim();
  return /^[A-Za-z0-9._-]{6,80}$/.test(safe) ? safe : null;
}

/** ساخت آدرس صفحه نتیجه روی origin مجاز. */
export function buildResultUrl(origin: string, status: ResultStatus, ref?: string | null): string {
  const url = new URL("/payment-result", origin);
  url.searchParams.set("status", status);
  if (ref) url.searchParams.set("ref", ref);
  return url.toString();
}

/** مسیر کال‌بک را همیشه با اسلش ابتدایی و روی origin مجاز می‌سازد. */
export function buildCallbackUrl(origin: string, callbackPath: string | null | undefined): string {
  const raw = callbackPath && callbackPath.trim() ? callbackPath.trim() : "/payment/callback";
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return new URL(path, origin).toString();
}
