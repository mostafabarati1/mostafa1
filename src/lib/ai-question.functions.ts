import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin";
import type { AiQuestionDraft } from "@/lib/ai-question.types";

const zOptions = z.array(z.object({ option_text: z.string().min(1), is_correct: z.boolean() }));

/** تولید پیش‌نویس سوال با هوش مصنوعی؛ چیزی مستقیم در بانک سوال ذخیره نمی‌شود. */
export const generateAiQuestionDrafts = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        categoryId: z.string().uuid().nullable(),
        subjectId: z.string().uuid().nullable(),
        topic: z.string().min(2).max(500),
        count: z.number().int().min(1).max(4),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ids: string[] }> => {
    const [catRes, subRes, examplesRes] = await Promise.all([
      data.categoryId
        ? context.supabase.from("categories").select("name").eq("id", data.categoryId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      data.subjectId
        ? context.supabase.from("subjects").select("name").eq("id", data.subjectId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      context.supabase.rpc(
        "ai_question_fewshot_examples" as never,
        {
          p_category_id: data.categoryId,
          p_limit: 3,
        } as never,
      ),
    ]);
    if (examplesRes.error) throw new Error(examplesRes.error.message);

    const examples =
      (examplesRes.data as unknown as {
        question_text: string;
        difficulty: string | null;
        options: { text: string; is_correct: boolean }[];
      }[]) ?? [];

    const { getChatModel } = await import("./ai-gateway.server");
    const sourceModel = getChatModel();
    const { generateQuestions } = await import("./ai-question.server");
    const generated = await generateQuestions({
      categoryName: (catRes.data as { name: string } | null)?.name ?? null,
      subjectName: (subRes.data as { name: string } | null)?.name ?? null,
      topic: data.topic,
      count: data.count,
      examples,
    });

    const ids: string[] = [];
    for (const q of generated) {
      const insertRes = await context.supabase.rpc(
        "ai_question_draft_insert" as never,
        {
          p_question_text: q.question_text,
          p_difficulty: q.difficulty,
          p_category_id: data.categoryId,
          p_subject_id: data.subjectId,
          p_options: q.options,
          p_explanation: q.explanation,
          p_source_model: sourceModel,
        } as never,
      );
      if (insertRes.error) throw new Error(insertRes.error.message);
      ids.push(insertRes.data as unknown as string);
    }

    return { ids };
  });

/** فهرست پیش‌نویس‌های تولیدشده. */
export const listAiQuestionDrafts = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z.object({ status: z.enum(["draft", "approved", "rejected"]).nullable() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<AiQuestionDraft[]> => {
    const res = await context.supabase.rpc(
      "ai_question_draft_list" as never,
      {
        p_status: data.status,
      } as never,
    );
    if (res.error) throw new Error(res.error.message);
    return (res.data as unknown as AiQuestionDraft[]) ?? [];
  });

/** ویرایش متن/گزینه‌های یک پیش‌نویس پیش از تأیید. */
export const updateAiQuestionDraft = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        question_text: z.string().min(3),
        difficulty: z.enum(["easy", "medium", "hard"]),
        category_id: z.string().uuid().nullable(),
        subject_id: z.string().uuid().nullable(),
        options: zOptions.length(4),
        explanation: z.string().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<void> => {
    const res = await context.supabase.rpc(
      "ai_question_draft_update" as never,
      {
        p_id: data.id,
        p_question_text: data.question_text,
        p_difficulty: data.difficulty,
        p_category_id: data.category_id,
        p_subject_id: data.subject_id,
        p_options: data.options,
        p_explanation: data.explanation,
      } as never,
    );
    if (res.error) throw new Error(res.error.message);
  });

/**
 * تأیید پیش‌نویس: فقط از همین مسیر صریح مدیر، سوال از طریق `save_question`
 * موجود در بانک سوال ذخیره و پاسخ تشریحی در `ai_explanations` ثبت می‌شود.
 */
export const approveAiQuestionDraft = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        question_text: z.string().min(3),
        difficulty: z.enum(["easy", "medium", "hard"]),
        category_id: z.string().uuid().nullable(),
        score: z.number().min(0),
        options: zOptions.length(4),
        explanation: z.string().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ questionId: string }> => {
    const saveRes = await context.supabase.rpc(
      "save_question" as never,
      {
        p_id: null,
        p_text: data.question_text,
        p_difficulty: data.difficulty,
        p_status: "active",
        p_category_id: data.category_id,
        p_score: data.score,
        p_options: data.options.map((o, i) => ({
          text: o.option_text,
          is_correct: o.is_correct,
          order: i + 1,
        })),
      } as never,
    );
    if (saveRes.error) throw new Error(saveRes.error.message);
    const questionId = saveRes.data as unknown as string;

    if (data.explanation) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { getChatModel } = await import("./ai-gateway.server");
      const upsertRes = await supabaseAdmin.from("ai_explanations").upsert(
        {
          question_id: questionId,
          explanation: data.explanation,
          model: getChatModel(),
          content_checksum: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "question_id" },
      );
      if (upsertRes.error) throw new Error(upsertRes.error.message);
    }

    const statusRes = await context.supabase.rpc(
      "ai_question_draft_set_status" as never,
      {
        p_id: data.id,
        p_status: "approved",
      } as never,
    );
    if (statusRes.error) throw new Error(statusRes.error.message);

    return { questionId };
  });

/** رد پیش‌نویس؛ هیچ داده‌ای وارد بانک سوال نمی‌شود. */
export const rejectAiQuestionDraft = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<void> => {
    const res = await context.supabase.rpc(
      "ai_question_draft_set_status" as never,
      {
        p_id: data.id,
        p_status: "rejected",
      } as never,
    );
    if (res.error) throw new Error(res.error.message);
  });
