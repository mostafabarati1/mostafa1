/**
 * قراردادهای داده‌ای لایه‌ی توسعه‌یافته‌ی ورود گروهی (additive).
 * این فایل جایگزین `validate.ts` یا `parse.ts` نیست و تنها آن‌ها را تکمیل می‌کند.
 */

import { z } from "zod";
import type { PreparedRow, RowError } from "./validate";

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const QUESTION_STATUSES = ["active", "draft", "inactive"] as const;
export const DUPLICATE_POLICIES = ["skip", "import_as_new", "stop_on_duplicate"] as const;

export type DuplicatePolicyPlus = (typeof DUPLICATE_POLICIES)[number];
export type QuestionStatusPlus = (typeof QUESTION_STATUSES)[number];

export const BATCH_STATUSES = [
  "pending",
  "validating",
  "importing",
  "partial",
  "completed",
  "failed",
  "rolled_back",
] as const;

export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const BATCH_STATUS_LABELS_FA: Record<BatchStatus, string> = {
  pending: "در انتظار",
  validating: "در حال اعتبارسنجی",
  importing: "در حال ورود",
  partial: "ناقص",
  completed: "کامل",
  failed: "ناموفق",
  rolled_back: "بازگردانی‌شده",
};

/** قرارداد payload هر سوال برای RPCهای جدید */
export const importOptionSchema = z.object({
  text: z.string().min(1),
  is_correct: z.boolean(),
  display_order: z.number().int().positive(),
});

export const importQuestionPayloadSchema = z.object({
  row_number: z.number().int().nonnegative(),
  question_text: z.string().min(1),
  options: z.array(importOptionSchema).min(2),
  question_type: z.enum(["single_choice", "multiple_choice"]).default("single_choice"),
  difficulty: z.enum(DIFFICULTIES).default("medium"),
  score: z.number().positive().default(1),
  category_id: z.string().uuid().nullable().default(null),
  subject_id: z.string().uuid().nullable().default(null),
  explanation: z.string().nullable().default(null),
  image_url: z.string().nullable().default(null),
  external_id: z.string().max(120).nullable().default(null),
});

export type ImportQuestionPayload = z.infer<typeof importQuestionPayloadSchema>;

/** خروجی هر Chunk از RPC جدید */
export type ChunkResult = {
  batch_id: string;
  chunk_number: number;
  processed: number;
  imported: number;
  duplicates: number;
  failed: number;
  next_chunk: number | null;
  status: BatchStatus;
};

/** مقصد ورود که در ویزارد انتخاب یا ساخته می‌شود */
export type ImportDestination = {
  examId: string;
  categoryId: string;
  subjectId: string;
  duplicatePolicy: DuplicatePolicyPlus;
  questionStatus: QuestionStatusPlus;
  autoCreateMissing: boolean;
};

/** تبدیل سطر آماده‌شده‌ی موجود به قرارداد جدید، بدون تغییر ساختار قبلی */
export function toImportQuestionPayload(
  row: PreparedRow,
  fallback?: { categoryId?: string | null; subjectId?: string | null },
): ImportQuestionPayload {
  const correctCount = row.options.filter((o) => o.is_correct).length;
  return {
    row_number: row.row_number,
    question_text: row.question_text,
    options: row.options.map((o) => ({
      text: o.text,
      is_correct: o.is_correct,
      display_order: o.display_order,
    })),
    question_type: correctCount > 1 ? "multiple_choice" : "single_choice",
    difficulty: row.difficulty,
    score: row.score,
    category_id: row.category_id ?? fallback?.categoryId ?? null,
    subject_id: row.subject_id ?? fallback?.subjectId ?? null,
    explanation: row.explanation,
    image_url: row.image_url,
    external_id: row.external_id,
  };
}

export type EnhancedRowStatus = "valid" | "duplicate" | "error";

export type EnhancedRowView = {
  row_number: number;
  status: EnhancedRowStatus;
  payload: ImportQuestionPayload | null;
  errors: RowError[];
  categoryName: string | null;
  subjectName: string | null;
};
