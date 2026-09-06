import { IMPORT_COLUMNS } from "./columns";

export type SourceFileType = "csv" | "xlsx" | "json";

export type ParsedFile = {
  fileName: string;
  fileType: SourceFileType;
  headers: string[];
  rows: Record<string, string>[];
  truncated: boolean;
};

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 5000;

function detectType(fileName: string): SourceFileType | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "csv") return "csv";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "json") return "json";
  return null;
}

function normalizeRecords(records: Record<string, unknown>[]): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const headers: string[] = [];
  for (const rec of records) {
    for (const key of Object.keys(rec)) {
      const clean = key.trim();
      if (clean && !headers.includes(clean)) headers.push(clean);
    }
  }
  const rows = records.map((rec) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(rec)) {
      const clean = k.trim();
      if (!clean) continue;
      out[clean] = v == null ? "" : String(v).trim();
    }
    return out;
  });
  return { headers, rows };
}

/** خواندن فایل ورودی و تبدیل آن به سطرهای متنی خام */
export async function parseImportFile(file: File): Promise<ParsedFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("حجم فایل بیش از ۱۰ مگابایت است.");
  }
  const fileType = detectType(file.name);
  if (!fileType) {
    throw new Error("فرمت فایل پشتیبانی نمی‌شود. فقط CSV، Excel و JSON مجاز است.");
  }

  let records: Record<string, unknown>[] = [];

  if (fileType === "csv") {
    const { default: Papa } = await import("papaparse");
    const text = await file.text();
    const result = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
    });
    records = result.data ?? [];
  } else if (fileType === "xlsx") {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("فایل اکسل هیچ کاربرگی ندارد.");
    const sheet = workbook.Sheets[sheetName];
    records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!, { defval: "", raw: false });
  } else {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("ساختار JSON نامعتبر است.");
    }
    if (!Array.isArray(parsed)) throw new Error("فایل JSON باید یک آرایه از سوالات باشد.");
    records = parsed as Record<string, unknown>[];
  }

  const cleaned = records.filter((r) =>
    Object.values(r).some((v) => v != null && String(v).trim() !== ""),
  );
  if (cleaned.length === 0) throw new Error("فایل هیچ سطر داده‌ای ندارد.");

  const truncated = cleaned.length > MAX_ROWS;
  const { headers, rows } = normalizeRecords(truncated ? cleaned.slice(0, MAX_ROWS) : cleaned);

  return { fileName: file.name, fileType, headers, rows, truncated };
}

/** نگاشت خودکار سرستون‌های فایل به ستون‌های استاندارد */
export function autoMapHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  const norm = (v: string) =>
    v
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "");

  for (const column of IMPORT_COLUMNS) {
    const candidates = [column.key, column.label, ...column.aliases].map(norm);
    const match = headers.find((h) => !used.has(h) && candidates.includes(norm(h)));
    if (match) {
      mapping[column.key] = match;
      used.add(match);
    } else {
      mapping[column.key] = "";
    }
  }
  return mapping;
}
