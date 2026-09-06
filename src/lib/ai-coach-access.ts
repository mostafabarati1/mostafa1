import type { AnalyticsPayload } from "./ai-coach.schema";

/** حداقل فاصلهٔ زمانی بین دو تحلیل (ضد اسپم). */
export const COACH_COOLDOWN_MINUTES = 5;

export type CoachEligibilityCode =
  "allowed" | "no_subscription" | "no_attempt" | "no_new_attempt" | "cooldown";

export type CoachEligibility = {
  allowed: boolean;
  code: CoachEligibilityCode;
  message: string;
  /** زمان آخرین آزمون تکمیل‌شده */
  last_attempt_at: string | null;
  /** زمان آخرین گزارش تولیدشده */
  last_report_at: string | null;
  /** ثانیه‌های باقیمانده تا پایان محدودیت زمانی */
  retry_after_seconds: number;
};

const MESSAGES: Record<CoachEligibilityCode, string> = {
  allowed: "",
  no_subscription: "مربی هوشمند فقط برای کاربران با اشتراک فعال در دسترس است.",
  no_attempt: "برای دریافت تحلیل، ابتدا حداقل یک آزمون را به پایان برسانید.",
  no_new_attempt:
    "تحلیل شما بر اساس آخرین آزمون به‌روز است. برای دریافت تحلیل جدید، یک آزمون دیگر را کامل کنید.",
  cooldown: "درخواست‌های شما پرتعداد است؛ چند دقیقه دیگر دوباره تلاش کنید.",
};

type MinimalClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

function latestAttemptAt(analytics: AnalyticsPayload): string | null {
  const times = (analytics.recent_attempts ?? [])
    .map((a) => a.submitted_at)
    .filter((v): v is string => !!v)
    .map((v) => new Date(v).getTime())
    .filter((t) => Number.isFinite(t));
  if (times.length === 0) return null;
  return new Date(Math.max(...times)).toISOString();
}

/**
 * شرایط دسترسی به مربی هوشمند:
 * ۱) اشتراک فعال، ۲) حداقل یک آزمون تکمیل‌شده،
 * ۳) برای تحلیل مجدد، آزمون جدیدی بعد از آخرین گزارش، ۴) فاصلهٔ زمانی حداقلی.
 */
export async function evaluateCoachEligibility(
  supabase: MinimalClient,
  analytics: AnalyticsPayload,
): Promise<CoachEligibility> {
  const base = {
    last_attempt_at: latestAttemptAt(analytics),
    last_report_at: null as string | null,
    retry_after_seconds: 0,
  };

  const subRes = await supabase.rpc("my_subscription");
  if (subRes.error) throw new Error(subRes.error.message);
  const hasActive = Boolean((subRes.data as { has_active?: boolean } | null)?.has_active);
  if (!hasActive) {
    return { allowed: false, code: "no_subscription", message: MESSAGES.no_subscription, ...base };
  }

  if ((analytics.performance?.attempts_total ?? 0) < 1 || !base.last_attempt_at) {
    return { allowed: false, code: "no_attempt", message: MESSAGES.no_attempt, ...base };
  }

  const latestRes = await supabase.rpc("ai_coach_report_latest_mine", {});
  const latest = (latestRes.data ?? null) as { created_at?: string } | null;
  const lastReportAt = latest?.created_at ?? null;
  base.last_report_at = lastReportAt;

  if (lastReportAt) {
    const reportTime = new Date(lastReportAt).getTime();
    const cooldownLeft = Math.ceil(
      (reportTime + COACH_COOLDOWN_MINUTES * 60_000 - Date.now()) / 1000,
    );
    if (cooldownLeft > 0) {
      return {
        allowed: false,
        code: "cooldown",
        message: MESSAGES.cooldown,
        ...base,
        retry_after_seconds: cooldownLeft,
      };
    }
    if (new Date(base.last_attempt_at).getTime() <= reportTime) {
      return {
        allowed: false,
        code: "no_new_attempt",
        message: MESSAGES.no_new_attempt,
        ...base,
      };
    }
  }

  return { allowed: true, code: "allowed", message: "", ...base };
}
