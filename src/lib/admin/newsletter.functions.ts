import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertAdmin,
  listNewsInput,
  newsInput,
  slugify,
  type AnyClient,
} from "@/lib/admin/newsletter-shared";

/**
 * مدیریت اخبار استخدامی و خبرنامه در پنل ادمین.
 *
 * همه توابع با میدل‌ور احراز هویت اجرا می‌شوند و نقش مدیر با RPC `is_admin`
 * سمت سرور بازبینی می‌شود (بررسی نقش هرگز به سمت کلاینت واگذار نمی‌شود).
 * ارسال پیامک از سرویس پیامک موجود پروژه استفاده می‌کند.
 */

export type NewsStatus = "draft" | "scheduled" | "published" | "archived";

export type AdminNewsRow = {
  id: string;
  title: string;
  slug: string | null;
  summary: string | null;
  body: string | null;
  status: NewsStatus;
  is_important: boolean;
  tags: string[];
  category_id: string | null;
  category_name: string | null;
  cover_url: string | null;
  source_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string | null;
  sms_sent: number;
  sms_pending: number;
};

export type NewsletterOverview = {
  audience: {
    total_users: number;
    active_accounts: number;
    newsletter_on: number;
    sms_on: number;
    sms_off: number;
    sms_eligible: number;
  };
  news: {
    total: number;
    published: number;
    draft: number;
    scheduled: number;
    last_7_days: number;
  };
  delivery: {
    sms_sent: number;
    sms_delivered: number;
    sms_failed: number;
    total: number;
    queued_jobs: number;
    failed_jobs: number;
  };
  campaigns: number;
};

export type SmsAudienceStats = {
  total_users: number;
  active_accounts: number;
  newsletter_on: number;
  newsletter_off: number;
  sms_on: number;
  sms_off: number;
  no_mobile: number;
  unverified_mobile: number;
  eligible: number;
};

export type NewsletterJobRow = {
  id: string;
  channel: string;
  status: string;
  attempts: number;
  template_key: string | null;
  last_error: string | null;
  scheduled_for: string;
  created_at: string;
  news_title: string | null;
};

export type NewsletterDeliveryRow = {
  id: string;
  provider: string | null;
  recipient: string;
  status: string;
  error: string | null;
  sent_at: string | null;
  created_at: string;
};

export type EnqueueResult = {
  event_id: string;
  channels: number;
  pending_jobs: number;
};

export const getNewsletterOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NewsletterOverview> => {
    const supabase = context.supabase as AnyClient;
    await assertAdmin(supabase);
    const { data, error } = await supabase.rpc("newsletter_admin_overview");
    if (error) throw new Error(error.message);
    return data as NewsletterOverview;
  });

export const listAdminNews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])

  .validator((input: unknown) => listNewsInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<AdminNewsRow[]> => {
    const supabase = context.supabase as AnyClient;
    await assertAdmin(supabase);

    let query = supabase
      .from("news")
      .select(
        "id,title,slug,summary,body,status,is_important,tags,category_id,cover_url,source_url,seo_title,seo_description,scheduled_at,published_at,created_at,updated_at,categories(name)",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.q) {
      const term = data.q.replace(/[%,()]/g, " ").trim();
      if (term) query = query.or(`title.ilike.%${term}%,summary.ilike.%${term}%`);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Record<string, unknown>[];
    const ids = list.map((r) => String(r["id"]));

    // شمارش کارهای پیامکی هر خبر (برای نمایش وضعیت ارسال)
    const counts = new Map<string, { sent: number; pending: number }>();
    if (ids.length > 0) {
      const { data: jobs } = await supabase
        .from("notification_jobs")
        .select("status,payload")
        .eq("channel", "sms")
        .limit(5000);
      for (const job of (jobs ?? []) as { status: string; payload: Record<string, unknown> }[]) {
        const newsId = String(job.payload?.["news_id"] ?? "");
        if (!newsId) continue;
        const entry = counts.get(newsId) ?? { sent: 0, pending: 0 };
        if (job.status === "sent") entry.sent++;
        else if (job.status === "pending" || job.status === "processing") entry.pending++;
        counts.set(newsId, entry);
      }
    }

    return list.map((row) => {
      const category = row["categories"] as { name: string } | null;
      const c = counts.get(String(row["id"])) ?? { sent: 0, pending: 0 };
      return {
        id: String(row["id"]),
        title: String(row["title"]),
        slug: (row["slug"] as string | null) ?? null,
        summary: (row["summary"] as string | null) ?? null,
        body: (row["body"] as string | null) ?? null,
        status: (row["status"] as NewsStatus) ?? "draft",
        is_important: Boolean(row["is_important"]),
        tags: (row["tags"] as string[] | null) ?? [],
        category_id: (row["category_id"] as string | null) ?? null,
        category_name: category?.name ?? null,
        cover_url: (row["cover_url"] as string | null) ?? null,
        source_url: (row["source_url"] as string | null) ?? null,
        seo_title: (row["seo_title"] as string | null) ?? null,
        seo_description: (row["seo_description"] as string | null) ?? null,
        scheduled_at: (row["scheduled_at"] as string | null) ?? null,
        published_at: (row["published_at"] as string | null) ?? null,
        created_at: String(row["created_at"]),
        updated_at: (row["updated_at"] as string | null) ?? null,
        sms_sent: c.sent,
        sms_pending: c.pending,
      };
    });
  });

export const saveAdminNews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => newsInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const supabase = context.supabase as AnyClient;
    const userId = context.userId;
    await assertAdmin(supabase);

    const slug = data.slug?.trim() || slugify(data.title) || `news-${Date.now()}`;
    const payload: Record<string, unknown> = {
      title: data.title,
      slug,
      summary: data.summary?.trim() || null,
      body: data.body?.trim() || null,
      status: data.status,
      is_important: data.is_important,
      tags: data.tags,
      category_id: data.category_id ?? null,
      cover_url: data.cover_url?.trim() || null,
      source_url: data.source_url?.trim() || null,
      seo_title: data.seo_title?.trim() || null,
      seo_description: data.seo_description?.trim() || null,
      scheduled_at: data.status === "scheduled" ? (data.scheduled_at ?? null) : null,
      channels: data.channels,
      published_at: data.status === "published" ? new Date().toISOString() : null,
    };

    if (data.id) {
      // در ویرایش، تاریخ انتشار قبلی حفظ می‌شود
      const { data: current } = await supabase
        .from("news")
        .select("published_at,status")
        .eq("id", data.id)
        .maybeSingle();
      const prev = current as { published_at: string | null; status: string } | null;
      payload["published_at"] =
        data.status === "published"
          ? (prev?.published_at ?? new Date().toISOString())
          : prev?.status === "published"
            ? prev.published_at
            : null;

      const { error } = await supabase.from("news").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      await supabase.rpc("log_audit", {
        _action: "update",
        _entity: "news",
        _entity_id: data.id,
        _details: { title: data.title, status: data.status },
      });
      return { id: data.id };
    }

    payload["created_by"] = userId;
    const { data: inserted, error } = await supabase
      .from("news")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const id = String((inserted as { id: string }).id);
    await supabase.rpc("log_audit", {
      _action: "create",
      _entity: "news",
      _entity_id: id,
      _details: { title: data.title, status: data.status },
    });
    return { id };
  });

export const setAdminNewsStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "scheduled", "published", "archived"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as AnyClient;
    await assertAdmin(supabase);
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "published") patch["published_at"] = new Date().toISOString();
    const { error } = await supabase.from("news").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.rpc("log_audit", {
      _action: "update",
      _entity: "news",
      _entity_id: data.id,
      _details: { status: data.status },
    });
    return { ok: true };
  });

export const getSmsAudienceStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ categoryIds: z.array(z.string().uuid()).max(50).default([]) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<SmsAudienceStats> => {
    const supabase = context.supabase as AnyClient;
    await assertAdmin(supabase);
    const { data: stats, error } = await supabase.rpc("newsletter_sms_audience_stats", {
      _category_ids: data.categoryIds,
    });
    if (error) throw new Error(error.message);
    return stats as SmsAudienceStats;
  });

/** ثبت خبر در صف اعلان (idempotent) و اجرای فوری دسته اول. */
export const sendNewsToSubscribers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        newsId: z.string().uuid(),
        channels: z
          .array(z.enum(["sms", "in_app", "email"]))
          .min(1)
          .default(["sms"]),
        audience: z.enum(["all_newsletter", "sms_enabled_only"]).default("all_newsletter"),
        categoryIds: z.array(z.string().uuid()).max(50).default([]),
        runNow: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as AnyClient;
    await assertAdmin(supabase);

    const { data: enqueued, error } = await supabase.rpc("newsletter_enqueue_news", {
      _news_id: data.newsId,
      _channels: data.channels,
      _audience: data.audience,
      _category_ids: data.categoryIds,
      _template_key: "news_published_sms",
      _only_user_ids: null,
    });
    if (error) throw new Error(error.message);

    await supabase.rpc("log_audit", {
      _action: "send",
      _entity: "news_newsletter",
      _entity_id: data.newsId,
      _details: { channels: data.channels, audience: data.audience },
    });

    let run: { claimed: number; sent: number; failed: number; skipped: number } | null = null;
    if (data.runNow && data.channels.includes("sms")) {
      const { processSmsQueue } = await import("@/lib/newsletter/queue.server");
      const summary = await processSmsQueue(50);
      run = {
        claimed: summary.claimed,
        sent: summary.sent,
        failed: summary.failed,
        skipped: summary.skipped,
      };
    }

    return { enqueued: enqueued as EnqueueResult, run };
  });

/** اجرای دستی پردازش صف پیامک از پنل مدیریت. */
export const runNewsletterQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).default(50) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as AnyClient);
    const { processSmsQueue } = await import("@/lib/newsletter/queue.server");
    return processSmsQueue(data.limit);
  });

export const listNewsletterJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        status: z
          .enum(["all", "pending", "processing", "sent", "failed", "skipped"])
          .default("all"),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<NewsletterJobRow[]> => {
    const supabase = context.supabase as AnyClient;
    await assertAdmin(supabase);

    let query = supabase
      .from("notification_jobs")
      .select("id,channel,status,attempts,template_key,last_error,scheduled_for,created_at,payload")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return ((rows ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row["id"]),
      channel: String(row["channel"]),
      status: String(row["status"]),
      attempts: Number(row["attempts"] ?? 0),
      template_key: (row["template_key"] as string | null) ?? null,
      last_error: (row["last_error"] as string | null) ?? null,
      scheduled_for: String(row["scheduled_for"]),
      created_at: String(row["created_at"]),
      news_title:
        ((row["payload"] as Record<string, unknown> | null)?.["news_title"] as string | null) ??
        null,
    }));
  });

export const listNewsletterDeliveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).default(50) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<NewsletterDeliveryRow[]> => {
    const supabase = context.supabase as AnyClient;
    await assertAdmin(supabase);
    const { data: rows, error } = await supabase
      .from("notification_deliveries")
      .select("id,provider,recipient,status,error,sent_at,created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as NewsletterDeliveryRow[];
  });
