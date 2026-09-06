import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin";
import {
  AI_BATCH_JOB_STATUSES,
  aiBatchFiltersSchema,
  type AiBatchJob,
  type AiBatchJobStatus,
} from "@/lib/ai-batch/types";

/**
 * لایه سرور «تولید انبوه پاسخ تشریحی».
 *
 * همه دسترسی‌ها از طریق توابع security definer دیتابیس انجام می‌شود
 * (`ai_explanation_*`) و کلاینت کاربر (نه service role) استفاده می‌شود.
 * تولید هر پاسخ همچنان از مسیر موجود `getQuestionExplanation` عبور می‌کند و
 * این ماژول فقط صف، پیشرفت و گزارش خطا را نگه می‌دارد.
 */

// نام RPCهای جدید هنوز در types تولیدشده Supabase نیست.
type LooseRpc = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

async function callRpc<T>(client: unknown, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (client as LooseRpc).rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function toJob(raw: unknown): AiBatchJob | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const status = String(row["status"] ?? "queued") as AiBatchJobStatus;
  const filters = (row["filters"] as Record<string, unknown> | null) ?? {};
  return {
    id: String(row["id"]),
    status: AI_BATCH_JOB_STATUSES.includes(status) ? status : "queued",
    total_questions: Number(row["total_questions"] ?? 0),
    processed: Number(row["processed"] ?? 0),
    succeeded: Number(row["succeeded"] ?? 0),
    failed: Number(row["failed"] ?? 0),
    filters: {
      category_id: (filters["category_id"] as string | null) ?? null,
      subject_id: (filters["subject_id"] as string | null) ?? null,
      limit: typeof filters["limit"] === "number" ? (filters["limit"] as number) : null,
    },
    error_summary: Array.isArray(row["error_summary"])
      ? (row["error_summary"] as Record<string, unknown>[]).map((e) => ({
          question_id: e["question_id"] == null ? null : String(e["question_id"]),
          error: e["error"] == null ? null : String(e["error"]),
          at: e["at"] == null ? null : String(e["at"]),
        }))
      : [],
    created_at: String(row["created_at"] ?? ""),
    updated_at: String(row["updated_at"] ?? ""),
  };
}

/** تعداد سوال‌های فعالِ بدون پاسخ تشریحی. */
export const getAiBatchPendingCount = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => aiBatchFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<{ pending: number }> => {
    const pending = await callRpc<number>(context.supabase, "ai_explanation_pending_count", {
      p_category_id: data.categoryId ?? null,
      p_subject_id: data.subjectId ?? null,
    });
    return { pending: Number(pending ?? 0) };
  });

/** ساخت صف جدید و بازگرداندن شناسه سوال‌های در انتظار. */
export const createAiBatchJob = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => aiBatchFiltersSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<{ jobId: string; questionIds: string[] }> => {
    const rows = await callRpc<{ question_id: string }[]>(
      context.supabase,
      "ai_explanation_pending_questions",
      {
        p_category_id: data.categoryId ?? null,
        p_subject_id: data.subjectId ?? null,
        p_limit: data.limit ?? 500,
      },
    );
    const questionIds = (rows ?? []).map((r) => r.question_id);
    if (questionIds.length === 0) {
      throw new Error("سوالی بدون پاسخ تشریحی برای این فیلترها یافت نشد.");
    }

    const jobId = await callRpc<string>(context.supabase, "ai_explanation_job_create", {
      p_total: questionIds.length,
      p_filters: {
        category_id: data.categoryId ?? null,
        subject_id: data.subjectId ?? null,
        limit: data.limit ?? 500,
      },
    });

    return { jobId: String(jobId), questionIds };
  });

const progressSchema = z.object({
  jobId: z.string().uuid(),
  questionId: z.string().uuid(),
  ok: z.boolean(),
  error: z.string().max(300).nullable().optional(),
});

/** ثبت نتیجه پردازش یک سوال در صف. */
export const reportAiBatchProgress = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => progressSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await callRpc(context.supabase, "ai_explanation_job_progress", {
      p_job_id: data.jobId,
      p_question_id: data.questionId,
      p_ok: data.ok,
      p_error: data.error ?? null,
    });
    return { ok: true };
  });

const statusSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(AI_BATCH_JOB_STATUSES),
});

/** توقف/ادامه/پایان صف. */
export const setAiBatchJobStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => statusSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await callRpc(context.supabase, "ai_explanation_job_set_status", {
      p_job_id: data.jobId,
      p_status: data.status,
    });
    return { ok: true };
  });

/** وضعیت یک صف. */
export const getAiBatchJob = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<AiBatchJob | null> => {
    const row = await callRpc<unknown>(context.supabase, "ai_explanation_job_get", {
      p_job_id: data.jobId,
    });
    return toJob(Array.isArray(row) ? row[0] : row);
  });

/** آخرین صف‌های اجراشده. */
export const listAiBatchJobs = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(50).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<AiBatchJob[]> => {
    const rows = await callRpc<unknown[]>(context.supabase, "ai_explanation_jobs_list", {
      p_limit: data.limit ?? 10,
    });
    return (rows ?? []).map(toJob).filter((j): j is AiBatchJob => j !== null);
  });
