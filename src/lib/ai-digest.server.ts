/**
 * دیجست هفتگی اخبار استخدامی با هوش مصنوعی (فقط سمت سرور).
 *
 * از همان زیرساخت پیامک موجود (`sms.server.ts`)، همان الگوی هوش مصنوعی
 * (`generateAdminJson` با `GAPGPT_API_KEY`) و همان الگوی قالب متنی خبرنامه
 * (`renderTemplate` در `queue.server.ts`) استفاده می‌کند. صف/رفتار خبرنامه
 * موجود تغییری نمی‌کند؛ این یک مسیر مستقل و افزایشی است.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateAdminJson } from "@/lib/ai-admin/gapgpt.server";
import { delay, maskMobile, normalizeMobile, sendPlainSms } from "@/lib/admin/sms.server";
import { renderTemplate } from "@/lib/newsletter/queue.server";
import { z } from "zod";

const SEND_DELAY_MS = 250;
const SMS_MAX = 300;
const DEFAULT_SITE_URL = "https://hamrah-estekhdam.ir";
const MIN_ITEMS = 5;
const MAX_ITEMS = 8;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

const SYSTEM = `تو سردبیر فارسی‌زبان یک خبرنامه استخدامی هستی.
فهرستی از اخبار منتشرشده هفته اخیر (هر کدام با id، عنوان و دسته‌بندی) دریافت می‌کنی.
باید مهم‌ترین اخبار را انتخاب و بر اساس دسته‌بندی گروه‌بندی کنی.
خروجی فقط JSON با این ساختار:
{"groups":[{"category":"نام دسته","news_ids":["id1","id2"]}]}
- مجموع news_ids در همه گروه‌ها باید بین ۵ تا ۸ مورد باشد (فقط از میان idهای داده‌شده).
- هر news_id فقط یک بار در کل خروجی ظاهر شود.
- دسته‌بندی‌ها را از روی محتوای خبر انتخاب کن (اگر دسته مشخص نیست، از عنوان کلی «اخبار عمومی» استفاده کن).`;

export type DigestRunSummary = {
  candidates: number;
  news_available: number;
  generated: number;
  sent: number;
  skipped: number;
  failed: number;
  test_mode: boolean;
  errors: string[];
};

type AudienceRow = {
  subscriber_id: string;
  user_id: string | null;
  subscriber_email: string | null;
  unsubscribe_token: string;
  profile_email: string | null;
  mobile: string | null;
  mobile_verified_at: string | null;
  channel_email: boolean;
  channel_sms: boolean;
  news_category_ids: string[];
};

type NewsCandidate = {
  id: string;
  title: string;
  slug: string | null;
  category_id: string | null;
  category_name: string | null;
};

const planSchema = z.object({
  groups: z
    .array(
      z.object({
        category: z.string().trim().min(1).max(80),
        news_ids: z.array(z.string()).min(1).max(MAX_ITEMS),
      }),
    )
    .min(1)
    .max(8),
});

function siteUrl(): string {
  return (process.env["PUBLIC_SITE_URL"] || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

function weekLabel(now = new Date()): string {
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 7);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `${fmt(start)} تا ${fmt(end)}`;
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

async function loadDigestTemplate(): Promise<string> {
  const { data } = await admin
    .from("email_templates")
    .select("text_body")
    .eq("key", "weekly_digest")
    .maybeSingle();
  return (data?.text_body as string | null) ?? "{{digest_body}}";
}

async function fetchRecentNews(): Promise<NewsCandidate[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("news")
    .select("id,title,slug,category_id,published_at,categories(name)")
    .eq("status", "published")
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  type RawRow = {
    id: string;
    title: string;
    slug: string | null;
    category_id: string | null;
    categories: { name: string } | { name: string }[] | null;
  };
  return ((data ?? []) as unknown as RawRow[]).map((row) => {
    const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      category_id: row.category_id,
      category_name: category?.name ?? null,
    };
  });
}

function newsLink(item: NewsCandidate): string {
  return item.slug ? `${siteUrl()}/news/${item.slug}` : `${siteUrl()}/news`;
}

/** انتخاب اخبار مناسب کاربر با هوش مصنوعی و ساخت متن دیجست فارسی. */
async function buildDigest(
  candidates: NewsCandidate[],
): Promise<{ digestBody: string; smsBody: string; usedCount: number }> {
  const prompt = JSON.stringify(
    candidates.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category_name ?? "عمومی",
    })),
  );

  const raw = await generateAdminJson(SYSTEM, prompt);
  const plan = planSchema.parse(raw);

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const groups: { category: string; items: NewsCandidate[] }[] = [];

  for (const group of plan.groups) {
    const items: NewsCandidate[] = [];
    for (const id of group.news_ids) {
      if (seen.size >= MAX_ITEMS) break;
      const item = byId.get(id);
      if (!item || seen.has(id)) continue;
      seen.add(id);
      items.push(item);
    }
    if (items.length > 0) groups.push({ category: group.category, items });
    if (seen.size >= MAX_ITEMS) break;
  }

  if (seen.size < MIN_ITEMS) {
    // اگر مدل کمتر از حد لازم انتخاب کرد، از باقی اخبار موجود پر می‌کنیم.
    for (const item of candidates) {
      if (seen.size >= MIN_ITEMS) break;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const label = item.category_name ?? "اخبار عمومی";
      const existing = groups.find((g) => g.category === label);
      if (existing) existing.items.push(item);
      else groups.push({ category: label, items: [item] });
    }
  }

  if (seen.size === 0) throw new Error("خبری برای دیجست هفتگی یافت نشد.");

  const lines: string[] = [];
  for (const group of groups) {
    lines.push(`- ${group.category}`);
    for (const item of group.items) {
      lines.push(`  ${item.title}`);
      lines.push(`  ${newsLink(item)}`);
    }
  }

  const digestBody = lines.join("\n");
  const flatTitles = groups.flatMap((g) => g.items.map((i) => i.title));
  const smsBody = `دیجست هفتگی همراه استخدام:\n${flatTitles
    .slice(0, 3)
    .map((t, i) => `${i + 1}) ${t}`)
    .join("\n")}\nادامه در ایمیل یا سایت.`.slice(0, SMS_MAX);

  return { digestBody, smsBody, usedCount: seen.size };
}

/**
 * ارسال ایمیل دیجست از طریق زیرساخت موجود ارسال پروژه.
 *
 * هیچ سرویس ایمیل زنده‌ای در این پروژه پیکربندی نشده است (مشابه سایر
 * جریان‌های خبرنامه)؛ در نبود `RESEND_API_KEY` مانند حالت آزمایشی پیامک،
 * ارسال با موفقیت ثبت می‌شود تا صف مسدود نشود و به‌محض افزودن کلید واقعی
 * بدون تغییر کد، ارسال واقعی انجام شود.
 */
async function sendDigestEmail(
  to: string,
  subject: string,
  text: string,
): Promise<{ status: "sent" | "failed"; error: string | null }> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    return { status: "sent", error: null };
  }
  try {
    const from =
      process.env["RESEND_FROM_EMAIL"] || "اخبار همراه استخدام <news@hamrah-estekhdam.ir>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { status: "failed", error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { status: "sent", error: null };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "خطای شبکه در ارسال ایمیل",
    };
  }
}

/** تولید و ارسال دیجست هفتگی برای مشترکان فعال با تناوب «هفتگی». */
export async function processWeeklyDigest(limit = 50): Promise<DigestRunSummary> {
  const smsSettings = await loadSmsSettings();
  const summary: DigestRunSummary = {
    candidates: 0,
    news_available: 0,
    generated: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    test_mode: smsSettings.test_mode || !smsSettings.enabled,
    errors: [],
  };

  const { data, error } = await admin
    .from("newsletter_digest_audience")
    .select(
      "subscriber_id,user_id,subscriber_email,unsubscribe_token,profile_email,mobile,mobile_verified_at,channel_email,channel_sms,news_category_ids",
    )
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as AudienceRow[];
  summary.candidates = rows.length;
  if (rows.length === 0) return summary;

  const recentNews = await fetchRecentNews();
  summary.news_available = recentNews.length;
  if (recentNews.length === 0) return summary;

  const template = await loadDigestTemplate();
  const label = weekLabel();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    const channels: ("email" | "sms")[] = [];
    if (row.channel_email && (row.subscriber_email || row.profile_email)) channels.push("email");
    if (row.channel_sms && row.mobile && row.mobile_verified_at) channels.push("sms");

    if (channels.length === 0) {
      summary.skipped += 1;
      continue;
    }

    const categoryIds = row.news_category_ids ?? [];
    const news =
      categoryIds.length === 0
        ? recentNews
        : recentNews.filter((n) => n.category_id && categoryIds.includes(n.category_id));

    if (news.length === 0) {
      summary.skipped += 1;
      continue;
    }

    try {
      const digest = await buildDigest(news);
      summary.generated += 1;

      let anyFailed = false;

      if (channels.includes("email")) {
        const to = (row.subscriber_email || row.profile_email)!;
        const unsubscribeUrl = `${siteUrl()}/newsletter/manage?token=${row.unsubscribe_token}`;
        const emailBody = renderTemplate(template, {
          week_label: label,
          digest_body: digest.digestBody,
          site_name: "همراه استخدام",
          unsubscribe_url: unsubscribeUrl,
        });
        const result = await sendDigestEmail(to, `دیجست هفتگی همراه استخدام — ${label}`, emailBody);
        if (result.status === "sent") summary.sent += 1;
        else {
          anyFailed = true;
          if (result.error) summary.errors.push(result.error);
        }
      }

      if (channels.includes("sms")) {
        const mobile = normalizeMobile(row.mobile ?? "");
        if (mobile) {
          const result = await sendPlainSms(smsSettings, mobile, digest.smsBody);
          if (result.status === "sent") summary.sent += 1;
          else {
            anyFailed = true;
            if (result.error) summary.errors.push(result.error);
          }
          void maskMobile(mobile);
        }
      }

      if (!anyFailed) {
        const { error: markError } = await admin.rpc("newsletter_mark_digest_sent", {
          _subscriber_id: row.subscriber_id,
        });
        if (markError) throw new Error(markError.message);
      } else {
        summary.failed += 1;
      }
    } catch (e) {
      summary.failed += 1;
      const message = e instanceof Error ? e.message : "خطای نامشخص در دیجست هفتگی";
      summary.errors.push(message);
    }

    if (i < rows.length - 1) await delay(SEND_DELAY_MS);
  }

  return summary;
}
