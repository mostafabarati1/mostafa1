import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin";

/**
 * پیشنهاد سطح دشواری سوال با هوش مصنوعی.
 * پیشنهاد فقط در ستون‌های `ai_*` ذخیره می‌شود و `difficulty` واقعی تنها با
 * اقدام صریح مدیر (`applyQuestionDifficulty`) تغییر می‌کند.
 */

const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export type DifficultySuggestionResult = {
  question_id: string;
  difficulty: (typeof DIFFICULTIES)[number];
  confidence: number;
  reason: string;
  current_difficulty: string | null;
};

type QuestionRow = {
  id: string;
  question_text: string;
  difficulty: string | null;
  subjects: { name: string } | null;
  categories: { name: string } | null;
  question_options: { option_text: string; is_correct: boolean }[];
};

export const suggestQuestionDifficulty = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => z.object({ questionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DifficultySuggestionResult> => {
    const { supabase } = context;
    const res = await supabase
      .from("questions")
      .select(
        "id, question_text, difficulty, subjects(name), categories(name), question_options(option_text, is_correct)",
      )
      .eq("id", data.questionId)
      .maybeSingle();
    if (res.error) throw new Error(res.error.message);
    const question = res.data as unknown as QuestionRow | null;
    if (!question) throw new Error("سوال یافت نشد.");

    const { suggestDifficulty } = await import("./ai-difficulty.server");
    const suggestion = await suggestDifficulty({
      questionText: question.question_text,
      options: question.question_options.map((o) => ({
        text: o.option_text,
        isCorrect: o.is_correct,
      })),
      subject: question.subjects?.name ?? null,
      category: question.categories?.name ?? null,
      currentDifficulty: question.difficulty,
    });

    const saveRes = await supabase.rpc(
      "ai_difficulty_save_suggestion" as never,
      {
        p_question_id: data.questionId,
        p_difficulty: suggestion.difficulty,
        p_confidence: suggestion.confidence,
        p_reason: suggestion.reason,
      } as never,
    );
    if (saveRes.error) throw new Error(saveRes.error.message);

    return {
      question_id: question.id,
      difficulty: suggestion.difficulty,
      confidence: suggestion.confidence,
      reason: suggestion.reason,
      current_difficulty: question.difficulty,
    };
  });

export const applyQuestionDifficulty = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) =>
    z.object({ questionId: z.string().uuid(), difficulty: z.enum(DIFFICULTIES) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc(
      "ai_difficulty_apply" as never,
      { p_question_id: data.questionId, p_difficulty: data.difficulty } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
