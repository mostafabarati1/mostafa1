import { z } from "zod";

/** Zod contract for the AI coaching output (shared by server fn and UI). */
export const coachResourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  why: z.string(),
});

export const coachWeaknessSchema = z.object({
  topic: z.string(),
  reason: z.string(),
  correct_rate: z.number().nullable(),
});

export const coachPlanItemSchema = z.object({
  title: z.string(),
  focus: z.string(),
  actions: z.array(z.string()),
  estimated_minutes: z.number(),
});

export const coachAnalysisSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  level: z.enum(["excellent", "good", "average", "weak", "insufficient_data"]),
  strengths: z.array(z.string()),
  weaknesses: z.array(coachWeaknessSchema),
  study_plan: z.array(coachPlanItemSchema),
  recommended_resources: z.array(coachResourceSchema),
  next_steps: z.array(z.string()),
  motivation: z.string(),
});

export type CoachAnalysis = z.infer<typeof coachAnalysisSchema>;

export const LEVEL_LABELS_FA: Record<CoachAnalysis["level"], string> = {
  excellent: "عالی",
  good: "خوب",
  average: "متوسط",
  weak: "نیازمند تلاش بیشتر",
  insufficient_data: "داده کافی نیست",
};

/** Analytics payload returned by the database analytics functions. */
export type AnalyticsPayload = {
  payload_version: number;
  range: { from: string | null; to: string | null };
  exam: {
    id: string;
    title: string;
    level: string | null;
    year: number | null;
    category_name: string | null;
    organization_name: string | null;
    question_count: number;
    subjects: { subject_id: string; name: string }[];
  } | null;
  performance: {
    attempts_total: number;
    passed: number;
    failed: number;
    avg_percent: number | null;
    total_time_minutes: number | null;
    answered_total: number;
  };
  recent_attempts: {
    exam_id: string;
    exam_title: string;
    submitted_at: string | null;
    percent: number;
    passed: boolean | null;
  }[];
  subjects: { subject_id: string; name: string; attempts: number; correct_rate: number }[];
  weak_topics: {
    category_id: string;
    subject_id: string | null;
    name: string;
    attempts: number;
    correct_rate: number;
    last_attempt_at: string | null;
  }[];
  strongest_topics: {
    category_id: string;
    subject_id: string | null;
    name: string;
    attempts: number;
    correct_rate: number;
    last_attempt_at: string | null;
  }[];
  difficulty: {
    difficulty: string;
    answered: number;
    correct_rate: number;
    avg_score_awarded: number;
  }[];
  timing: { available: boolean; reason?: string; total_time_minutes: number | null };
};

export type LearningResource = {
  id: string;
  title: string;
  type: string;
  topic: string | null;
  subject_id: string | null;
  category_id: string | null;
  url: string;
  language: string;
  description: string | null;
};

/** خلاصهٔ گزارش قبلی مربی که به‌عنوان زمینه به مدل داده می‌شود. */
export type PreviousReportSummary = {
  headline: string;
  level: string;
  weak_topics: string[];
  created_at: string;
};

export type CoachResult = {
  analytics: AnalyticsPayload;
  resources: LearningResource[];
  analysis: CoachAnalysis;
  generated_at: string;
  /** آیا کاربر پیش از این گزارشی داشته که در تحلیل جاری لحاظ شده است. */
  has_previous_report?: boolean;
};
