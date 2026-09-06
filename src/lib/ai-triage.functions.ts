import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin";
import type { TriageResult } from "@/lib/ai-triage.types";

/**
 * تحلیل هوشمند یک گزارش سوال.
 * نتیجه در ستون `ai_triage` ذخیره می‌شود؛ وضعیت و یادداشت مدیر فقط با
 * اقدام صریح مدیر در همان فرم موجود تغییر می‌کند.
 */

type TriageInputRow = {
  report_id: string;
  reason: string;
  description: string | null;
  question_text: string;
  difficulty: string | null;
  options: { text: string; is_correct: boolean }[];
};

export const triageQuestionReport = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ reportId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<TriageResult> => {
    const inputRes = await context.supabase.rpc(
      "question_report_triage_input" as never,
      { p_report_id: data.reportId } as never,
    );
    if (inputRes.error) throw new Error(inputRes.error.message);
    const row = inputRes.data as unknown as TriageInputRow | null;
    if (!row) throw new Error("گزارش یافت نشد.");

    const { triageReport } = await import("./ai-triage.server");
    const result = await triageReport({
      reason: row.reason,
      description: row.description,
      questionText: row.question_text,
      difficulty: row.difficulty,
      options: Array.isArray(row.options) ? row.options : [],
    });

    const saveRes = await context.supabase.rpc(
      "question_report_save_triage" as never,
      {
        p_report_id: data.reportId,
        p_triage: { ...result, at: new Date().toISOString() },
      } as never,
    );
    if (saveRes.error) throw new Error(saveRes.error.message);

    return result;
  });
