/**
 * خواندن متغیرهای محیطی سمت سرور در یک نقطه واحد.
 *
 * قواعد:
 * - همه مقادیر فقط داخل تابع خوانده می‌شوند (نه در module scope) تا در
 *   Cloudflare Worker / TanStack Start مقدار تزریق‌شده در زمان درخواست دیده شود.
 * - نام‌های رزرو‌شده (`SUPABASE_*`) اولویت دارند و اگر پلتفرم آن‌ها را تزریق
 *   نکند، از نام‌های جایگزین `APP_SUPABASE_*` استفاده می‌شود.
 * - هیچ مقداری در لاگ یا پاسخ چاپ نمی‌شود؛ فقط «نام» متغیر گم‌شده گزارش می‌شود.
 */
import {
  SUPABASE_PUBLISHABLE_KEY_FALLBACK,
  SUPABASE_URL_FALLBACK,
} from "@/integrations/supabase/public-config";

function read(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

function requireEnv(label: string, ...names: string[]): string {
  const value = read(...names);
  if (!value) {
    throw new ConfigurationError(
      `پیکربندی ناقص است: متغیر محیطی ${label} تنظیم نشده است (${names.join(" | ")}).`,
    );
  }
  return value;
}

export function getSupabaseUrl(): string {
  // مقادیر عمومی هستند؛ اگر پلتفرم متغیر محیطی را تزریق نکند از fallback استفاده می‌شود.
  return read("SUPABASE_URL", "APP_SUPABASE_URL", "VITE_SUPABASE_URL") ?? SUPABASE_URL_FALLBACK;
}

export function getSupabasePublishableKey(): string {
  return (
    read(
      "SUPABASE_PUBLISHABLE_KEY",
      "APP_SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
    ) ?? SUPABASE_PUBLISHABLE_KEY_FALLBACK
  );
}

export function getSupabaseServiceRoleKey(): string {
  return requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "APP_SUPABASE_SERVICE_ROLE_KEY",
  );
}

export function getAppEnv(): string {
  return read("APP_ENV", "NODE_ENV") ?? "development";
}

export function isProductionEnv(): boolean {
  return getAppEnv() === "production";
}

/**
 * Origin عمومی برنامه. در production نبودِ `APP_URL` یک خطای پیکربندی است و
 * هیچ fallback به آدرس preview وجود ندارد.
 */
export function getAppUrl(): string {
  const raw = read("APP_URL", "PUBLIC_SITE_URL");
  if (!raw) {
    throw new ConfigurationError("پیکربندی ناقص است: متغیر محیطی APP_URL تنظیم نشده است.");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ConfigurationError("متغیر محیطی APP_URL یک URL معتبر نیست.");
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new ConfigurationError("متغیر محیطی APP_URL باید https باشد.");
  }
  return parsed.origin;
}

/**
 * لیست origin های مجاز برای بازگشت از درگاه/کال‌بک.
 * `APP_URL` همیشه مجاز است؛ موارد اضافی با `ALLOWED_ORIGINS` (کاما جدا) تنظیم می‌شود.
 */
export function getAllowedOrigins(): string[] {
  const extra = (read("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return null;
      }
    })
    .filter((value): value is string => value !== null);

  const origins = new Set(extra);
  try {
    origins.add(getAppUrl());
  } catch {
    // در محیط توسعه ممکن است APP_URL تنظیم نشده باشد.
  }
  return [...origins];
}

export function isAllowedOrigin(origin: string): boolean {
  const allowed = getAllowedOrigins();
  return allowed.length === 0 ? false : allowed.includes(origin);
}
