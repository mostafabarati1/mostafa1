import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * خبرنامه داخلی بر پایه حساب کاربری.
 *
 * کاربر واردشده نیازی به ثبت ایمیل مجزا ندارد؛ رکورد مشترک به‌صورت خودکار به
 * حساب او متصل می‌شود (`link_newsletter_subscriber`) و تنظیمات از طریق
 * `newsletter_my_status` / `newsletter_update_my_preferences` خوانده و ذخیره
 * می‌شود. کانال پیامک تنها با موبایل تأییدشده فعال می‌شود.
 */

export type NewsletterChannelPreferences = {
  newsletter: boolean;
  news_alerts: boolean;
  exam_alerts: boolean;
  deadline_alerts: boolean;
  results_alerts: boolean;
  exam_card_alerts: boolean;
  organization_alerts: boolean;
  channel_email: boolean;
  channel_in_app: boolean;
  channel_sms: boolean;
  digest_frequency: "instant" | "daily" | "weekly";
  news_category_ids: string[];
};

export type MyNewsletterStatus = {
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  mobile_verified: boolean;
  account_status: string | null;
  subscriber_id: string | null;
  subscriber_status: "none" | "pending" | "active" | "unsubscribed" | "bounced";
  preferences: NewsletterChannelPreferences;
};

const prefsSchema = z
  .object({
    newsletter: z.boolean(),
    news_alerts: z.boolean(),
    exam_alerts: z.boolean(),
    deadline_alerts: z.boolean(),
    results_alerts: z.boolean(),
    exam_card_alerts: z.boolean(),
    organization_alerts: z.boolean(),
    channel_email: z.boolean(),
    channel_in_app: z.boolean(),
    channel_sms: z.boolean(),
    digest_frequency: z.enum(["instant", "daily", "weekly"]),
    news_category_ids: z.array(z.string().uuid()).max(50),
  })
  .partial();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

async function readStatus(supabase: AnyClient): Promise<MyNewsletterStatus | null> {
  const { data, error } = await supabase.rpc("newsletter_my_status");
  if (error) throw new Error(error.message);
  return (data ?? null) as MyNewsletterStatus | null;
}

export const getMyNewsletterStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyNewsletterStatus | null> =>
    readStatus(context.supabase as AnyClient),
  );

export const setMyNewsletterEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ email: z.string().trim().email().max(200) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<MyNewsletterStatus | null> => {
    const supabase = context.supabase as AnyClient;
    const { data: result, error } = await supabase.rpc("newsletter_set_my_email", {
      _email: data.email,
    });
    if (error) throw new Error(error.message);
    return (result ?? null) as MyNewsletterStatus | null;
  });

export const updateMyNewsletterPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => prefsSchema.parse(input))
  .handler(async ({ data, context }): Promise<MyNewsletterStatus | null> => {
    const supabase = context.supabase as AnyClient;

    // فعال‌سازی پیامک فقط با موبایل تأییدشده مجاز است.
    if (data.channel_sms) {
      const current = await readStatus(supabase);
      if (!current?.mobile || !current.mobile_verified) {
        throw new Error("برای دریافت پیامک، ابتدا شماره موبایل خود را تأیید کنید.");
      }
    }

    const { data: result, error } = await supabase.rpc("newsletter_update_my_preferences", {
      _prefs: data,
    });
    if (error) throw new Error(error.message);
    return (result ?? null) as MyNewsletterStatus | null;
  });
