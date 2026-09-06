/**
 * تشخیص تکراری در سطح فایل (کلاینت).
 * تشخیص تکراری در سطح دیتابیس همچنان با RPC سرور انجام می‌شود.
 */

import { normalizeName } from "./import-normalizers";
import type { PreparedRow } from "./validate";

export function rowFingerprint(row: {
  question_text: string;
  options: { text: string }[];
  category_id?: string | null;
}): string {
  const options = row.options
    .map((o) => normalizeName(o.text))
    .slice()
    .sort()
    .join("|");
  return `${normalizeName(row.question_text)}||${options}||${row.category_id ?? ""}`;
}

export type DedupeResult<T> = {
  unique: T[];
  duplicateRowNumbers: number[];
};

/** نخستین وقوع هر اثر انگشت نگه داشته می‌شود و بقیه تکراری علامت می‌خورند. */
export function dedupeRows<T extends PreparedRow>(rows: T[]): DedupeResult<T> {
  const seen = new Set<string>();
  const unique: T[] = [];
  const duplicateRowNumbers: number[] = [];
  for (const row of rows) {
    const fp = rowFingerprint(row);
    if (seen.has(fp)) {
      duplicateRowNumbers.push(row.row_number);
      continue;
    }
    seen.add(fp);
    unique.push(row);
  }
  return { unique, duplicateRowNumbers };
}

/** جداسازی سطرها بر اساس نتیجه‌ی تشخیص تکراری سرور و سیاست انتخاب‌شده */
export function applyDuplicatePolicy<T extends PreparedRow>(
  rows: T[],
  serverDuplicates: Set<number>,
  policy: "skip" | "import_as_new" | "stop_on_duplicate",
): { toImport: T[]; skipped: T[] } {
  if (policy === "import_as_new" || policy === "stop_on_duplicate") {
    return { toImport: rows, skipped: [] };
  }
  const toImport: T[] = [];
  const skipped: T[] = [];
  for (const row of rows) {
    if (serverDuplicates.has(row.row_number)) skipped.push(row);
    else toImport.push(row);
  }
  return { toImport, skipped };
}

/**
 * ادغام اختیاری تکرارهای معنایی (embedding) با تکرارهای دیتابیس (fingerprint)
 * پیش از اعمال سیاست تکراری. منطق rowFingerprint/dedupeRows تغییری نمی‌کند؛
 * این فقط یک لایه‌ی مکمل و اختیاری است.
 */
export function mergeDuplicateSources(
  fingerprintDuplicates: Set<number>,
  semanticDuplicates: Set<number>,
): Set<number> {
  return new Set<number>([...fingerprintDuplicates, ...semanticDuplicates]);
}
