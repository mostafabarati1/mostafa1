import { z } from "zod";

export const practiceOptionSchema = z.object({
  id: z.string().uuid(),
  option_text: z.string(),
  is_correct: z.boolean(),
  image_url: z.string().nullable().optional(),
});

export const practiceQuestionSchema = z.object({
  id: z.string().uuid(),
  question_text: z.string(),
  difficulty: z.string(),
  created_at: z.string().optional(),
  category: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  has_explanation: z.boolean(),
  options: z.array(practiceOptionSchema),
});

export const practiceListSchema = z.object({
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  items: z.array(practiceQuestionSchema),
});

export const practiceFiltersSchema = z.object({
  categories: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  subjects: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  organizations: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  exams: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        slug: z.string().nullable().optional(),
        subject_ids: z.array(z.string().uuid()).default([]),
      }),
    )
    .default([]),
});

export const practiceSessionQuestionSchema = practiceQuestionSchema.extend({
  answer: z
    .object({
      selected_option_id: z.string().uuid().nullable(),
      is_correct: z.boolean().nullable(),
    })
    .nullable(),
});

export const practiceSessionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["in_progress", "finished"]),
  created_at: z.string(),
  finished_at: z.string().nullable(),
  difficulty: z.string().nullable(),
  exam_id: z.string().uuid().nullable().optional(),
  exam_title: z.string().nullable().optional(),
  exam_slug: z.string().nullable().optional(),
  correct_count: z.number(),
  incorrect_count: z.number(),
  total: z.number(),
  questions: z.array(practiceSessionQuestionSchema),
});

export const practiceSessionSummarySchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  created_at: z.string(),
  correct_count: z.number(),
  incorrect_count: z.number(),
  total: z.number(),
  exam_id: z.string().uuid().nullable().optional(),
  exam_title: z.string().nullable().optional(),
});

export const practiceSessionListSchema = z.array(practiceSessionSummarySchema);

export const explanationResultSchema = z.object({
  question_id: z.string().uuid(),
  explanation: z.string(),
  model: z.string().nullable(),
  cached: z.boolean(),
  correct_option_id: z.string().uuid().nullable(),
});

export type PracticeOption = z.infer<typeof practiceOptionSchema>;
export type PracticeQuestion = z.infer<typeof practiceQuestionSchema>;
export type PracticeList = z.infer<typeof practiceListSchema>;
export type PracticeFilters = z.infer<typeof practiceFiltersSchema>;
export type PracticeSession = z.infer<typeof practiceSessionSchema>;
export type PracticeSessionQuestion = z.infer<typeof practiceSessionQuestionSchema>;
export type PracticeSessionSummary = z.infer<typeof practiceSessionSummarySchema>;
export type ExplanationResult = z.infer<typeof explanationResultSchema>;

export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "آسان",
  medium: "متوسط",
  hard: "دشوار",
};
