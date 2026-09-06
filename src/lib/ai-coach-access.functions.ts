import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { evaluateCoachEligibility, type CoachEligibility } from "./ai-coach-access";
import type { AnalyticsPayload } from "./ai-coach.schema";

/** وضعیت دسترسی کاربر جاری به مربی هوشمند (اشتراک، آزمون تکمیل‌شده، محدودیت درخواست). */
export const getCoachEligibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CoachEligibility> => {
    const { supabase } = context;
    const analyticsRes = await supabase.rpc("candidate_analytics_self", {});
    if (analyticsRes.error) throw new Error(analyticsRes.error.message);
    const analytics = analyticsRes.data as unknown as AnalyticsPayload;
    return evaluateCoachEligibility(supabase as never, analytics);
  });
