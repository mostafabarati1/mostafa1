// Server-only: ارسال خودکار لینک محصولات پس از پرداخت موفق سفارش فروشگاه.
// این ماژول فقط از سمت سرور و با کلاینت سرویس‌رول استفاده می‌شود.
import {
  maskMobile,
  normalizeMobile,
  sendPlainSms,
  type SmsProviderSettings,
} from "@/lib/admin/sms.server";

type DeliveryOutcome = { skipped: boolean; reason?: string; links: number };

/**
 * پس از paid شدن سفارش، لینک محصولات خریداری‌شده را با پنل پیامکی به مشتری می‌فرستد.
 * کاملاً idempotent: هر سفارش فقط یک‌بار در shop_order_link_deliveries ثبت می‌شود.
 */
export async function deliverShopOrderLinks(orderId: string): Promise<DeliveryOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as {
    // جدول‌های فروشگاه در تایپ‌های تولیدشدهٔ Supabase نیستند؛ تایپ آزاد فقط در همین لایهٔ سرور.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (t: string) => any;
  };

  const { data: existing } = await db
    .from("shop_order_link_deliveries")
    .select("order_id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (existing) return { skipped: true, reason: "already", links: 0 };

  const { data: order } = await db
    .from("shop_orders")
    .select("id, user_id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.status !== "paid") return { skipped: true, reason: "not_paid", links: 0 };

  const { data: items } = await db
    .from("shop_order_items")
    .select("product_id, title_snapshot")
    .eq("order_id", orderId);

  const productIds = (items ?? [])
    .map((row: { product_id: string | null }) => row.product_id)
    .filter(Boolean) as string[];
  if (productIds.length === 0) return { skipped: true, reason: "no_items", links: 0 };

  const { data: products } = await db
    .from("shop_products")
    .select("id, title, product_link")
    .in("id", productIds);

  const links = (products ?? [])
    .filter((p: { product_link: string | null }) => !!p.product_link)
    .map((p: { title: string; product_link: string }) => `${p.title}: ${p.product_link}`);

  if (links.length === 0) {
    await db
      .from("shop_order_link_deliveries")
      .insert({ order_id: orderId, status: "skipped", links_count: 0, error: "no_link" });
    return { skipped: true, reason: "no_link", links: 0 };
  }

  const { data: profile } = await db
    .from("profiles")
    .select("mobile")
    .eq("id", order.user_id)
    .maybeSingle();
  const mobile = profile?.mobile ? normalizeMobile(String(profile.mobile)) : null;
  if (!mobile) {
    await db.from("shop_order_link_deliveries").insert({
      order_id: orderId,
      status: "skipped",
      links_count: links.length,
      error: "no_mobile",
    });
    return { skipped: true, reason: "no_mobile", links: links.length };
  }

  const { data: settingsRow } = await db
    .from("sms_settings")
    .select("provider, enabled, test_mode, api_key, sender_line")
    .limit(1)
    .maybeSingle();
  const settings: SmsProviderSettings = {
    provider: settingsRow?.provider ?? "kavenegar",
    enabled: Boolean(settingsRow?.enabled),
    test_mode: settingsRow?.test_mode ?? true,
    api_key: settingsRow?.api_key ?? null,
    sender_line: settingsRow?.sender_line ?? null,
  };

  const message = ["همراه استخدام", "پرداخت شما با موفقیت انجام شد.", ...links].join("\n");
  const result = await sendPlainSms(settings, mobile, message);

  await db.from("shop_order_link_deliveries").insert({
    order_id: orderId,
    status: result.status,
    links_count: links.length,
    mobile_masked: maskMobile(mobile),
    error: result.error,
  });

  return { skipped: false, links: links.length };
}
