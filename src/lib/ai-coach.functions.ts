import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { evaluateCoachEligibility } from "./ai-coach-access";
import type {
  AnalyticsPayload,
  CoachResult,
  LearningResource,
  PreviousReportSummary,
} from "./ai-coach.schema";

const inputSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

type CoachReportRow = {
  id: string;
  period_from: string | null;
  period_to: string | null;
  level: string | null;
  headline: string | null;
  summary: { weak_topics?: string[] } | null;
  created_at: string;
};

export const getCoachAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => inputSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<CoachResult> => {
    const { supabase } = context;

    const analyticsRes = await supabase.rpc("candidate_analytics_self", {
      ...(data.from ? { p_from: data.from } : {}),
      ...(data.to ? { p_to: data.to } : {}),
    });
    if (analyticsRes.error) throw new Error(analyticsRes.error.message);
    const analytics = analyticsRes.data as unknown as AnalyticsPayload;

    // کنترل دسترسی و محدودیت درخواست پیش از هر تماس با هوش مصنوعی
    const eligibility = await evaluateCoachEligibility(supabase as never, analytics);
    if (!eligibility.allowed) throw new Error(eligibility.message);

    const subjectIds = Array.from(
      new Set(
        [...analytics.weak_topics, ...analytics.subjects]
          .map((t) => ("subject_id" in t ? t.subject_id : null))
          .filter((v): v is string => !!v),
      ),
    );
    const categoryIds = analytics.weak_topics.map((t) => t.category_id).filter(Boolean);

    const resourcesRes = await supabase.rpc("resources_for_topics", {
      ...(subjectIds.length ? { p_subject_ids: subjectIds } : {}),
      ...(categoryIds.length ? { p_category_ids: categoryIds } : {}),
      p_limit: 12,
    });
    if (resourcesRes.error) throw new Error(resourcesRes.error.message);
    let resources = (resourcesRes.data ?? []) as unknown as LearningResource[];

    // رتبه‌بندی/توضیح‌گذاری هوشمند منابع بر اساس نقاط ضعف؛ در صورت خطا همان فهرست اولیه حفظ می‌شود.
    const weaknessTopics = analytics.weak_topics.map((t) => t.name).filter(Boolean);
    if (resources.length > 0 && weaknessTopics.length > 0) {
      const { rankResources } = await import("./ai-resource-ranker.server");
      resources = await rankResources(weaknessTopics, resources);
    }

    // گزارش قبلی کاربر برای زمینه‌سازی تحلیل جدید (در صورت وجود)
    let previousReport: PreviousReportSummary | null = null;
    const latestRes = await supabase.rpc("ai_coach_report_latest_mine" as never, {} as never);
    const latestRow = (latestRes.data ?? null) as unknown as CoachReportRow | null;
    if (!latestRes.error && latestRow) {
      previousReport = {
        headline: latestRow.headline ?? "",
        level: latestRow.level ?? "",
        weak_topics: Array.isArray(latestRow.summary?.weak_topics)
          ? (latestRow.summary?.weak_topics ?? [])
          : [],
        created_at: latestRow.created_at,
      };
    }

    const { generateCoachAnalysis } = await import("./ai-coach.server");
    const analysis = await generateCoachAnalysis(analytics, resources, previousReport);

    // ذخیرهٔ گزارش جدید در تاریخچه (append-only)؛ شکست در ذخیره نباید نتیجهٔ فعلی را مختل کند.
    try {
      await supabase.rpc(
        "ai_coach_report_append" as never,
        {
          p_period_from: data.from ?? null,
          p_period_to: data.to ?? null,
          p_level: analysis.level,
          p_headline: analysis.headline,
          p_summary: {
            weak_topics: analysis.weaknesses.map((w) => w.topic),
            strengths: analysis.strengths,
          },
        } as never,
      );
    } catch {
      // ذخیرهٔ تاریخچه اختیاری است؛ خطای آن نباید تحلیل فعلی را مختل کند.
    }

    return {
      analytics,
      resources,
      analysis,
      generated_at: new Date().toISOString(),
      has_previous_report: previousReport !== null,
    };
  });
