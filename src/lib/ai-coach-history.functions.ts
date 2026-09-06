import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type CoachHistoryReport = {
  id: string;
  period_from: string | null;
  period_to: string | null;
  level: string | null;
  headline: string | null;
  summary: { weak_topics?: string[]; strengths?: string[] } | null;
  created_at: string;
};

const inputSchema = z.object({
  limit: z.number().int().positive().max(50).optional(),
});

/** فهرست گزارش‌های پیشین مربی هوشمند برای کاربر جاری (جدیدترین اول). */
export const getCoachHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => inputSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<CoachHistoryReport[]> => {
    const { supabase } = context;
    const res = await supabase.rpc(
      "ai_coach_reports_list_mine" as never,
      {
        p_limit: data.limit ?? 10,
      } as never,
    );
    if (res.error) throw new Error(res.error.message);
    return (res.data ?? []) as unknown as CoachHistoryReport[];
  });
