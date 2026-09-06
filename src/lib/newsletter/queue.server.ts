/**
 * پردازشگر صف اعلان‌ها (کانال پیامک).
 *
 * این ماژول فقط سمت سرور اجرا می‌شود (پسوند `.server.ts`) و از سرویس پیامک
 * موجود پروژه (`src/lib/admin/sms.server.ts` + جدول `sms_settings`) استفاده
 * می‌کند؛ هیچ سرویس‌دهنده جدیدی اضافه نشده است.
 *
 * تضمین‌ها:
 *  - هر کار با `for update skip locked` برداشته می‌شود → بدون ارسال موازی تکراری.
 *  - `dedupe_key` روی هر (خبر، کاربر، کانال) → بدون ارسال دوباره.
 *  - اعتبارسنجی مجدد تنظیمات کاربر درست پیش از ارسال (RPC `newsletter_claim_jobs`).
 *  - خطاها با backoff نمایی حداکثر ۳ بار تلاش مجدد می‌شوند.
 *  - شماره موبایل هرگز خام لاگ نمی‌شود؛ فقط ماسک‌شده ذخیره می‌شود.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { delay, maskMobile, normalizeMobile, sendPlainSms } from "@/lib/admin/sms.server";

const SEND_DELAY_MS = 250;
const DEFAULT_SITE_URL = "https://hamrah-estekhdam.ir";

/**
 * نوع کار «دیجست هفتگی» (افزایشی).
 *
 * پردازش واقعی در `src/lib/ai-digest.server.ts` انجام می‌شود؛ این ثابت فقط
 * برای هم‌نامی کلید قالب و مستندسازی نوع کار در همین ماژول صف قرار دارد و
 * هیچ رفتار موجود صف پیامک را تغییر نمی‌دهد.
 */
export const NEWSLETTER_DIGEST_TEMPLATE_KEY = "weekly_digest" as const;
export type NewsletterDigestJobType = "weekly_digest";

export type QueueRunSummary = {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
  test_mode: boolean;
  provider: string;
  errors: string[];
};

type ClaimedJob = {
  job_id: string;
  claim_user_id: string;
  claim_channel: string;
  template_key: string | null;
  payload: Record<string, unknown> | null;
  mobile: string | null;
  email: string | null;
  attempts: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

function siteUrl(): string {
  return (process.env["PUBLIC_SITE_URL"] || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

/** جای‌گذاری متغیرهای `{{var}}` در متن قالب. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => vars[key] ?? "");
}

async function loadSmsSettings() {
  const { data, error } = await admin
    .from("sms_settings")
    .select("provider,enabled,test_mode,api_key,sender_line")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    provider: (data?.provider as string) ?? "kavenegar",
    enabled: Boolean(data?.enabled),
    test_mode: (data?.test_mode as boolean) ?? true,
    api_key: (data?.api_key as string | null) ?? null,
    sender_line: (data?.sender_line as string | null) ?? null,
  };
}

async function loadTemplate(key: string): Promise<string> {
  const { data } = await admin
    .from("email_templates")
    .select("text_body")
    .eq("key", key)
    .maybeSingle();
  const body = (data?.text_body as string | null) ?? null;
  return body ?? "{{site_name}}\nخبر استخدامی جدید:\n{{news_title}}\nمشاهده:\n{{news_url}}";
}

function buildMessage(template: string, payload: Record<string, unknown> | null): string {
  const slug = String(payload?.["news_slug"] ?? "");
  const newsUrl = slug ? `${siteUrl()}/news/${slug}` : `${siteUrl()}/news`;
  return renderTemplate(template, {
    site_name: "همراه استخدام",
    news_title: String(payload?.["news_title"] ?? "خبر جدید"),
    news_summary: String(payload?.["news_summary"] ?? ""),
    category: String(payload?.["category"] ?? ""),
    news_url: newsUrl,
  }).slice(0, 480);
}

async function complete(
  jobId: string,
  status: "sent" | "failed" | "skipped",
  provider: string,
  opts: { messageId?: string | null; recipient?: string | null; error?: string | null } = {},
) {
  const { error } = await admin.rpc("newsletter_complete_job", {
    _job_id: jobId,
    _status: status,
    _provider: provider,
    _provider_message_id: opts.messageId ?? null,
    _recipient: opts.recipient ?? null,
    _error: opts.error ?? null,
    _delivery_status: null,
  });
  if (error) throw new Error(error.message);
}

/** پردازش یک دسته از کارهای پیامکی صف. */
export async function processSmsQueue(limit = 50): Promise<QueueRunSummary> {
  const settings = await loadSmsSettings();
  const summary: QueueRunSummary = {
    claimed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    test_mode: settings.test_mode || !settings.enabled,
    provider: settings.provider,
    errors: [],
  };

  const { data, error } = await admin.rpc("newsletter_claim_jobs", {
    _channel: "sms",
    _limit: Math.min(Math.max(limit, 1), 200),
  });
  if (error) throw new Error(error.message);

  const jobs = (data ?? []) as ClaimedJob[];
  summary.claimed = jobs.length;
  if (jobs.length === 0) return summary;

  const templateCache = new Map<string, string>();

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!;
    const mobile = normalizeMobile(job.mobile ?? "");
    if (!mobile) {
      summary.skipped++;
      await complete(job.job_id, "skipped", settings.provider, {
        error: "شماره موبایل معتبر نیست",
      });
      continue;
    }

    const key = job.template_key ?? "news_published_sms";
    if (!templateCache.has(key)) templateCache.set(key, await loadTemplate(key));
    const message = buildMessage(templateCache.get(key)!, job.payload);
    const masked = maskMobile(mobile);

    try {
      const result = await sendPlainSms(settings, mobile, message);
      if (result.status === "sent") {
        summary.sent++;
        await complete(job.job_id, "sent", settings.provider, {
          recipient: masked,
          messageId: result.providerStatus != null ? String(result.providerStatus) : null,
        });
      } else {
        summary.failed++;
        if (result.error) summary.errors.push(result.error);
        await complete(job.job_id, "failed", settings.provider, {
          recipient: masked,
          error: result.error ?? "ارسال ناموفق بود",
        });
      }
    } catch (e) {
      summary.failed++;
      const msg = e instanceof Error ? e.message : "خطای نامشخص در ارسال پیامک";
      summary.errors.push(msg);
      await complete(job.job_id, "failed", settings.provider, {
        recipient: masked,
        error: msg,
      });
    }

    if (i < jobs.length - 1) await delay(SEND_DELAY_MS);
  }

  return summary;
}
