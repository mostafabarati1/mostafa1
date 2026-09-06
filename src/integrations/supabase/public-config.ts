/**
 * مقادیر عمومی (publishable) پروژه Supabase.
 *
 * فایل `.env` در گیت نگه‌داری نمی‌شود، بنابراین در بیلد تولیدی متغیرهای
 * `VITE_SUPABASE_*` تزریق نمی‌شدند و کلاینت با خطای «Missing Supabase
 * environment variable(s)» بالا نمی‌آمد. این مقادیر عمومی هستند (کلید
 * publishable با RLS محافظت می‌شود) و به‌عنوان مقدار پیش‌فرض استفاده می‌شوند.
 */
export const SUPABASE_URL_FALLBACK = "https://spldqzwxpfroeeeairqg.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY_FALLBACK = "sb_publishable_HIdyfO8X30pR5CEgqkfzfQ__UoU3TKD";
