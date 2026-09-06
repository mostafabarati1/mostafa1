import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { explanationResultSchema, type ExplanationResult } from "./practice.schema";

const inputSchema = z.object({
  questionId: z.string().uuid(),
  force: z.boolean().optional(),
});

type QuestionRow = {
  id: string;
  question_text: string;
  difficulty: string | null;
  subjects: { name: string } | null;
  categories: { name: string } | null;
  question_options: { id: string; option_text: string; is_correct: boolean }[];
};

/**
 * پاسخ تشریحی سوال را برمی‌گرداند؛ اگر کش معتبر (با چک‌سام هم‌خوان) موجود باشد
 * از دیتابیس خوانده می‌شود و در غیر این صورت فقط یک بار تولید و ذخیره می‌شود.
 */
export const getQuestionExplanation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ExplanationResult> => {
    const { supabase, userId } = context;

    const cachedRes = await supabase.rpc("get_ai_explanation", {
      p_question_id: data.questionId,
    });
    if (cachedRes.error) throw new Error(cachedRes.error.message);
    const cached = cachedRes.data as unknown as {
      cached: boolean;
      checksum: string;
      explanation?: string;
      model?: string | null;
    };

    const questionRes = await supabase
      .from("questions")
      .select(
        "id, question_text, difficulty, subjects(name), categories(name), question_options(id, option_text, is_correct)",
      )
      .eq("id", data.questionId)
      .maybeSingle();
    if (questionRes.error) throw new Error(questionRes.error.message);
    const question = questionRes.data as unknown as QuestionRow | null;

    const correctOptionId = question?.question_options.find((o) => o.is_correct)?.id ?? null;

    if (cached.cached && cached.explanation && !data.force) {
      return explanationResultSchema.parse({
        question_id: data.questionId,
        explanation: cached.explanation,
        model: cached.model ?? null,
        cached: true,
        correct_option_id: correctOptionId,
      });
    }

    if (!question) throw new Error("سوال یافت نشد.");

    const { generateQuestionExplanation } = await import("./practice-explanation.server");
    const generated = await generateQuestionExplanation({
      questionText: question.question_text,
      options: question.question_options.map((o) => ({
        text: o.option_text,
        isCorrect: o.is_correct,
      })),
      subject: question.subjects?.name ?? null,
      category: question.categories?.name ?? null,
      difficulty: question.difficulty,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const upsertRes = await supabaseAdmin.from("ai_explanations").upsert(
      {
        question_id: data.questionId,
        explanation: generated.explanation,
        model: generated.model,
        content_checksum: cached.checksum,
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "question_id" },
    );
    if (upsertRes.error) throw new Error(upsertRes.error.message);

    return explanationResultSchema.parse({
      question_id: data.questionId,
      explanation: generated.explanation,
      model: generated.model,
      cached: false,
      correct_option_id: correctOptionId,
    });
  });
