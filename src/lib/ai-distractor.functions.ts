import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin";
import type { DistractorQuestionInput } from "@/lib/ai-distractor.types";

/** بارگذاری سوال و گزینه‌ها برای تحلیل کیفیت گزینه‌های نادرست. */
export const loadDistractorQuestionInput = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ questionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DistractorQuestionInput> => {
    const res = await context.supabase.rpc(
      "ai_distractor_question_input" as never,
      {
        p_question_id: data.questionId,
      } as never,
    );
    if (res.error) throw new Error(res.error.message);
    return res.data as unknown as DistractorQuestionInput;
  });

/**
 * اجرای تحلیل گزینه‌های نادرست با هوش مصنوعی و ذخیره گزارش در ستون
 * `ai_distractor_report`. هیچ گزینه‌ای مستقیم تغییر نمی‌کند.
 */
export const runDistractorAnalysis = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ questionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DistractorQuestionInput> => {
    const inputRes = await context.supabase.rpc(
      "ai_distractor_question_input" as never,
      {
        p_question_id: data.questionId,
      } as never,
    );
    if (inputRes.error) throw new Error(inputRes.error.message);
    const row = inputRes.data as unknown as DistractorQuestionInput | null;
    if (!row) throw new Error("سوال یافت نشد.");

    const { analyzeDistractors } = await import("./ai-distractor.server");
    const report = await analyzeDistractors({
      questionText: row.question_text,
      difficulty: row.difficulty,
      options: row.options.map((o) => ({ text: o.option_text, is_correct: o.is_correct })),
    });

    const saveRes = await context.supabase.rpc(
      "ai_distractor_save_report" as never,
      {
        p_question_id: data.questionId,
        p_report: report,
      } as never,
    );
    if (saveRes.error) throw new Error(saveRes.error.message);

    return { ...row, ai_distractor_report: report, ai_distractor_reviewed: true };
  });

/**
 * اعمال پیشنهاد یک گزینه به‌صورت مجزا؛ هرگز به‌صورت گروهی/خودکار انجام نمی‌شود.
 */
export const applyDistractorSuggestion = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        questionId: z.string().uuid(),
        optionId: z.string().uuid(),
        optionText: z.string().min(1).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<void> => {
    const res = await context.supabase.rpc(
      "ai_distractor_apply_option" as never,
      {
        p_question_id: data.questionId,
        p_option_id: data.optionId,
        p_option_text: data.optionText,
      } as never,
    );
    if (res.error) throw new Error(res.error.message);
  });
