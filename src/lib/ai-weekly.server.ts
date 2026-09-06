/**
 * گزارش پیشرفت هفتگی کاربران (فقط سمت سرور).
 *
 * از همان سرویس پیامک موجود (`sms.server.ts`) و جدول `ai_weekly_reports`
 * استفاده می‌کند. صف و رفتار خبرنامه موجود تغییری نمی‌کند.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { delay, maskMobile, normalizeMobile, sendPlainSms } from "@/lib/admin/sms.server";
import { generateAdminJson } from "@/lib/ai-admin/gapgpt.server";

const SEND_DELAY_MS = 250;
const SMS_MAX = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

const SYSTEM = `تو مربی فارسی‌زبان آمادگی آزمون‌های استخدامی هستی.
بر اساس آمار هفتگی کاربر، یک گزارش کوتاه و انگیزشی فارسی بنویس.
خروجی فقط JSON: {"sms":"متن کوتاه پیامک","email":"متن ایمیل"}
- sms حداکثر ۳۰۰ کاراکتر، بدون ایموجی.
- email حداکثر ۴ پاراگراف کوتاه، شامل یک پیشنهاد عملی برای هفته بعد.
- اگر فعالیتی ثبت نشده، لحن دعوت‌کننده و بدون سرزنش باشد.`;

export type WeeklyRunSummary = {
  candidates: number;
  generated: number;
  sent: number;
  skipped: number;
  failed: number;
  test_mode: boolean;
  errors: string[];
};

type AudienceRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  mobile_verified_at: string | null;
  email_enabled: boolean;
  sms_enabled: boolean;
};

/** شنبه/ابتدای هفته جاری به‌صورت تاریخ ISO. */
export function weekStartISO(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

async function loadSmsSettings() {
  const { data } = await admin
    .from("sms_settings")
    .select("provider,enabled,test_mode,api_key,sender_line")
    .limit(1)
    .maybeSingle();
  return {
    provider: (data?.provider as string) ?? "kavenegar",
    enabled: Boolean(data?.enabled),
    test_mode: (data?.test_mode as boolean) ?? true,
    api_key: (data?.api_key as string | null) ?? null,
    sender_line: (data?.sender_line as string | null) ?? null,
  };
}

async function buildReport(
  name: string,
  stats: Record<string, unknown>,
): Promise<{ sms: string; email: string }> {
  const prompt = [
    `نام کاربر: ${name || "کاربر عزیز"}`,
    `تعداد جلسات تمرین هفته: ${stats["practice_sessions"] ?? 0}`,
    `پاسخ‌های درست: ${stats["practice_correct"] ?? 0}`,
    `پاسخ‌های نادرست: ${stats["practice_incorrect"] ?? 0}`,
    `تعداد آزمون‌ها: ${stats["exam_attempts"] ?? 0}`,
    `میانگین درصد آزمون‌ها: ${stats["exam_avg_percent"] ?? 0}`,
  ].join("\n");

  const raw = (await generateAdminJson(SYSTEM, prompt)) as Record<string, unknown>;
  const sms = String(raw["sms"] ?? "").trim();
  const email = String(raw["email"] ?? "").trim();
  if (!sms && !email) throw new Error("گزارش هفتگی تولید نشد.");
  return { sms: sms.slice(0, SMS_MAX), email: email || sms };
}

/** تولید و ارسال گزارش هفتگی برای مشترکان فعال با تناوب «هفتگی». */
export async function processWeeklyReports(limit = 50): Promise<WeeklyRunSummary> {
  const settings = await loadSmsSettings();
  const summary: WeeklyRunSummary = {
    candidates: 0,
    generated: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    test_mode: settings.test_mode || !settings.enabled,
    errors: [],
  };

  const weekStart = weekStartISO();
  const { data, error } = await admin
    .from("ai_weekly_audience")
    .select("user_id, full_name, email, mobile, mobile_verified_at, email_enabled, sms_enabled")
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as AudienceRow[];
  summary.candidates = rows.length;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;

    const existing = await admin
      .from("ai_weekly_reports")
      .select("id, status")
      .eq("user_id", row.user_id)
      .eq("week_start", weekStart)
      .maybeSingle();
    if (existing.data && existing.data.status !== "failed") {
      summary.skipped += 1;
      continue;
    }

    const channels: string[] = [];
    if (row.email_enabled && row.email) channels.push("email");
    if (row.sms_enabled && row.mobile && row.mobile_verified_at) channels.push("sms");
    if (channels.length === 0) {
      summary.skipped += 1;
      continue;
    }

    try {
      const statsRes = await admin.rpc("ai_weekly_user_stats", { p_user_id: row.user_id });
      if (statsRes.error) throw new Error(statsRes.error.message);
      const stats = (statsRes.data ?? {}) as Record<string, unknown>;

      const report = await buildReport(row.full_name ?? "", stats);
      summary.generated += 1;

      let status = "generated";
      let sendError: string | null = null;

      if (channels.includes("sms")) {
        const mobile = normalizeMobile(row.mobile ?? "");
        if (mobile) {
          const result = await sendPlainSms(settings, mobile, report.sms);
          if (result.status === "sent") {
            status = "sent";
            summary.sent += 1;
          } else {
            sendError = result.error ?? "ارسال پیامک ناموفق بود";
            summary.failed += 1;
          }
          void maskMobile(mobile);
        }
      }

      await admin.from("ai_weekly_reports").upsert(
        {
          user_id: row.user_id,
          week_start: weekStart,
          content: report.email,
          channels,
          status: sendError ? "failed" : status,
          error: sendError,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,week_start" },
      );
      if (sendError) summary.errors.push(sendError);
    } catch (e) {
      summary.failed += 1;
      const message = e instanceof Error ? e.message : "خطای نامشخص در گزارش هفتگی";
      summary.errors.push(message);
      await admin.from("ai_weekly_reports").upsert(
        {
          user_id: row.user_id,
          week_start: weekStart,
          status: "failed",
          error: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,week_start" },
      );
    }

    if (i < rows.length - 1) await delay(SEND_DELAY_MS);
  }

  return summary;
}
