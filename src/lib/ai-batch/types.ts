import { z } from "zod";

/** فیلترهای انتخاب سوال برای تولید انبوه پاسخ تشریحی. */
export const aiBatchFiltersSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(5000).optional(),
});

export type AiBatchFilters = z.infer<typeof aiBatchFiltersSchema>;

export const AI_BATCH_JOB_STATUSES = [
  "queued",
  "running",
  "paused",
  "done",
  "failed",
  "canceled",
] as const;

export type AiBatchJobStatus = (typeof AI_BATCH_JOB_STATUSES)[number];

export type AiBatchJob = {
  id: string;
  status: AiBatchJobStatus;
  total_questions: number;
  processed: number;
  succeeded: number;
  failed: number;
  filters: { category_id: string | null; subject_id: string | null; limit: number | null };
  error_summary: { question_id: string | null; error: string | null; at: string | null }[];
  created_at: string;
  updated_at: string;
};

/** فاصله بین درخواست‌ها برای کنترل نرخ مصرف سرویس هوش مصنوعی. */
export const AI_BATCH_DELAY_MS = 400;
