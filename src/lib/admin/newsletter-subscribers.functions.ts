import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertAdmin,
  subscriberListSchema,
  SUBSCRIBER_COLUMNS,
  type AnyClient,
} from "@/lib/admin/newsletter-shared";

/**
 * مدیریت مشترکان خبرنامه در پنل ادمین.
 *
 * همان الگوی سایر توابع ادمین پروژه: میدل‌ور احراز هویت + بازبینی نقش مدیر با
 * RPC `is_admin` سمت سرور. هیچ کلید سرویس‌رول و هیچ داده مشترکی به کلاینت
 * غیرمجاز نمی‌رسد و anon هیچ دسترسی خواندنی ندارد.
 */

export type SubscriberRow = {
  id: string;
  email: string | null;
  name: string | null;
  source: string | null;
  status: string;
  user_id: string | null;
  created_at: string;
};

export type SubscriberListResult = {
  items: SubscriberRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type SubscriberStats = {
  total: number;
  active: number;
  pending: number;
  unsubscribed: number;
  this_month: number;
};

export const listNewsletterSubscribers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => subscriberListSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<SubscriberListResult> => {
    const supabase = context.supabase as AnyClient;
    await assertAdmin(supabase);

    const from = (data.page - 1) * data.pageSize;
    let query = supabase
      .from("newsletter_subscribers")
      .select(SUBSCRIBER_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + data.pageSize - 1);

    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.q) {
      const term = data.q.replace(/[%,()]/g, " ").trim();
      if (term) query = query.or(`email.ilike.%${term}%,name.ilike.%${term}%`);
    }

    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);

    return {
      items: (rows ?? []) as SubscriberRow[],
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

export const getNewsletterSubscriberStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubscriberStats> => {
    const supabase = context.supabase as AnyClient;
    await assertAdmin(supabase);

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const base = () =>
      supabase.from("newsletter_subscribers").select("id", { count: "exact", head: true });

    const [total, active, pending, unsubscribed, thisMonth] = await Promise.all([
      base(),
      base().eq("status", "active"),
      base().eq("status", "pending"),
      base().eq("status", "unsubscribed"),
      base().gte("created_at", monthStart.toISOString()),
    ]);

    const firstError =
      total.error || active.error || pending.error || unsubscribed.error || thisMonth.error;
    if (firstError) throw new Error(firstError.message);

    return {
      total: total.count ?? 0,
      active: active.count ?? 0,
      pending: pending.count ?? 0,
      unsubscribed: unsubscribed.count ?? 0,
      this_month: thisMonth.count ?? 0,
    };
  });

export const setNewsletterSubscriberStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "active", "unsubscribed", "bounced"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase = context.supabase as AnyClient;
    await assertAdmin(supabase);

    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "unsubscribed") patch["unsubscribed_at"] = new Date().toISOString();
    if (data.status === "active") {
      patch["unsubscribed_at"] = null;
      patch["confirmed_at"] = new Date().toISOString();
    }

    const { error } = await supabase.from("newsletter_subscribers").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteNewsletterSubscriber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const supabase = context.supabase as AnyClient;
    await assertAdmin(supabase);

    const { error } = await supabase.from("newsletter_subscribers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const exportNewsletterSubscribers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    subscriberListSchema.omit({ page: true, pageSize: true }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<SubscriberRow[]> => {
    const supabase = context.supabase as AnyClient;
    await assertAdmin(supabase);

    let query = supabase
      .from("newsletter_subscribers")
      .select(SUBSCRIBER_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.q) {
      const term = data.q.replace(/[%,()]/g, " ").trim();
      if (term) query = query.or(`email.ilike.%${term}%,name.ilike.%${term}%`);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as SubscriberRow[];
  });
