import { supabase } from "@/integrations/supabase/client";

/**
 * لایه دسترسی خبرنامه.
 *
 * جداول خبرنامه با مهاجرت‌های `supabase/migrations/2026082409*_newsletter_*.sql`
 * اضافه می‌شوند. تا زمانی که `src/integrations/supabase/types.ts` دوباره تولید
 * نشده، این جداول در تایپ‌ها وجود ندارند؛ بنابراین فقط برای همین جداول از یک
 * ارجاع بدون تایپ استفاده می‌کنیم. سایر بخش‌های پروژه اصلی دست‌نخورده و
 * کاملاً تایپ‌دار باقی می‌مانند.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nlDb = supabase as any;

export type SubscriberStatus = "pending" | "active" | "unsubscribed" | "bounced";

export type NewsletterPreferences = {
  newsletter: boolean;
  exam_alerts: boolean;
  deadline_alerts: boolean;
  results_alerts: boolean;
  exam_card_alerts: boolean;
  news_alerts: boolean;
  organization_alerts: boolean;
  channel_email: boolean;
  channel_in_app: boolean;
  digest_frequency: "instant" | "daily" | "weekly";
};

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** عضویت در خبرنامه — برای کاربر مهمان و کاربر واردشده یکسان کار می‌کند. */
export async function subscribeEmail(email: string, source = "site", name?: string) {
  const clean = email.trim().toLowerCase();
  if (!emailPattern.test(clean)) {
    throw new Error("ایمیل معتبر نیست.");
  }

  const { data: auth } = await supabase.auth.getUser();
  const payload: Record<string, unknown> = { email: clean, status: "pending", source };
  const cleanName = name?.trim();
  if (cleanName) payload["name"] = cleanName;
  if (auth.user) payload["user_id"] = auth.user.id;

  const { error } = await nlDb.from("newsletter_subscribers").insert(payload);
  if (error) {
    // ایمیل تکراری خطای کاربر نیست
    if (error.code === "23505") return { alreadySubscribed: true as const };
    throw new Error(error.message);
  }
  return { alreadySubscribed: false as const };
}

/** ---------- مدیریت اشتراک با توکن (لینک‌های داخل ایمیل) ---------- */

export type SubscriptionView = {
  email: string;
  status: SubscriberStatus;
  preferences: (Partial<NewsletterPreferences> & { digest_frequency?: string }) | null;
};

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await nlDb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export function confirmSubscription(token: string) {
  return rpc<boolean>("newsletter_confirm", { _token: token });
}

export function getSubscriptionByToken(token: string) {
  return rpc<SubscriptionView | null>("newsletter_get_by_token", { _token: token });
}

export function updatePreferencesByToken(token: string, prefs: Record<string, boolean | string>) {
  return rpc<boolean>("newsletter_update_preferences", { _token: token, _prefs: prefs });
}

export function unsubscribeByToken(token: string) {
  return rpc<boolean>("newsletter_unsubscribe", { _token: token });
}

/** ---------- اخبار و اطلاعیه‌ها ---------- */

export type NewsItem = {
  id: string;
  title: string;
  slug: string | null;
  summary: string | null;
  published_at: string | null;
};

export async function listPublishedNews(limit = 20): Promise<NewsItem[]> {
  const { data, error } = await nlDb
    .from("news")
    .select("id, title, slug, summary, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as NewsItem[];
}
