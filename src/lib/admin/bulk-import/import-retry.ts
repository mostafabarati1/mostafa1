/**
 * ابزارهای تلاش مجدد برای Chunkها و ردیف‌های ناموفق.
 * منطق شبکه‌ای در اینجا خالص نگه داشته شده تا قابل تست باشد.
 */

export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  onRetry?: (attempt: number, error: unknown) => void;
};

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 2;
  const baseDelay = options.baseDelayMs ?? 400;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      options.onRetry?.(attempt + 1, error);
      await new Promise((resolve) => setTimeout(resolve, baseDelay * 2 ** attempt));
    }
  }
  throw lastError;
}

/** ساخت فهرست Chunkها با شماره‌ی پایدار (۱-مبنا) برای idempotency سرور */
export function buildChunks<T>(rows: T[], size: number): { chunkNumber: number; rows: T[] }[] {
  const safeSize = Math.max(1, size);
  const chunks: { chunkNumber: number; rows: T[] }[] = [];
  for (let i = 0; i < rows.length; i += safeSize) {
    chunks.push({ chunkNumber: Math.floor(i / safeSize) + 1, rows: rows.slice(i, i + safeSize) });
  }
  return chunks;
}

/** فقط سطرهایی که در گزارش خطا آمده‌اند برای تلاش مجدد انتخاب می‌شوند. */
export function selectRetryRows<T extends { row_number: number }>(
  rows: T[],
  failedRowNumbers: Iterable<number>,
): T[] {
  const failed = new Set(failedRowNumbers);
  return rows.filter((r) => failed.has(r.row_number));
}
