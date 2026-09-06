import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAppUrl } from "@/lib/server-env";
import { buildCallbackUrl } from "@/lib/payments/callback-utils";

/**
 * پرداخت فروشگاه — کنار سیستم پرداخت موجود و بدون تغییر آن.
 *
 * طراحی عمدی:
 *  - شروع پرداخت با همان الگوی startZarinpalPayment ولی روی RPC افزایشی shop_create_payment_intent.
 *  - کال‌بک درگاه همان مسیر عمومی موجود (payment.callback.ts) است و کاربر به /payment-result می‌رود؛
 *    آن صفحه چیزی درباره سفارش نمی‌داند و ویرایش نمی‌شود.
 *  - بنابراین قطعیت وضعیت سفارش از مسیر «مصالحه» انجام می‌شود:
 *    reconcileShopPayment (verify مستقل درگاه در صورت نیاز) و RPCهای
 *    shop_confirm_order_payment / shop_my_orders که idempotent هستند.
 */

const ZARINPAL_SANDBOX_MERCHANT = "1344b5d4-004b-4e48-bc24-5b6c79c2416b";

export type ShopPaymentStartResult = {
  payment_id: string;
  redirect_url: string;
};

export type ShopPaymentReconcileResult = {
  order_status: string;
  ref_id: string | null;
};

type MinimalClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

type GatewaySettings = {
  merchant_id: string | null;
  sandbox: boolean;
  callback_path: string | null;
  currency: string | null;
  enabled: boolean;
};

async function loadGatewaySettings(): Promise<GatewaySettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("payment_gateway_settings")
    .select("merchant_id, sandbox, callback_path, currency, enabled")
    .single();
  if (error) throw new Error("Payment gateway is not configured");
  if (!data.enabled) throw new Error("Payment gateway is disabled");
  return data as GatewaySettings;
}

function merchantOf(settings: GatewaySettings): string {
  const merchantId = settings.merchant_id || (settings.sandbox ? ZARINPAL_SANDBOX_MERCHANT : "");
  if (!merchantId) throw new Error("Merchant ID is not configured");
  return merchantId;
}

/** شروع پرداخت زرین‌پال برای یک سفارش فروشگاه. */
export const startShopPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as MinimalClient;

    // ۱) ساخت ردیف payments برای سفارش (SECURITY DEFINER با auth.uid کاربر).
    const { data: intent, error: intentError } = await sb.rpc("shop_create_payment_intent", {
      p_order_id: data.orderId,
      p_gateway: "zarinpal",
    });
    if (intentError) throw new Error(intentError.message);
    const intentObj = intent as { payment_id: string; amount: number; currency: string };

    // ۲) تنظیمات درگاه با کلاینت سرویس‌رول.
    const settings = await loadGatewaySettings();
    const origin = getAppUrl();
    const callbackUrl = buildCallbackUrl(origin, settings.callback_path);

    const endpoint = settings.sandbox
      ? "https://sandbox.zarinpal.com/pg/v4/payment/request.json"
      : "https://payment.zarinpal.com/pg/v4/payment/request.json";

    // ۳) دریافت authority از درگاه.
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant_id: merchantOf(settings),
        amount: intentObj.amount,
        currency: intentObj.currency === "IRT" ? "IRT" : "IRR",
        callback_url: callbackUrl,
        description: "خرید از فروشگاه همراه استخدام",
      }),
    });
    const body = (await resp.json()) as {
      data?: { authority: string; code?: number };
      errors?: { code?: number; message?: string };
    };
    if (!resp.ok || !body.data?.authority) {
      throw new Error(
        `خطا در اتصال به درگاه پرداخت (${body.errors?.code ?? body.data?.code ?? resp.status})`,
      );
    }

    // ۴) ذخیره authority روی ردیف پرداخت.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: updateError } = await supabaseAdmin
      .from("payments")
      .update({ authority: body.data.authority, status: "processing" })
      .eq("id", intentObj.payment_id);
    if (updateError) throw new Error(updateError.message);

    const payBase = settings.sandbox
      ? "https://sandbox.zarinpal.com/pg/StartPay"
      : "https://payment.zarinpal.com/pg/StartPay";

    return {
      payment_id: intentObj.payment_id,
      redirect_url: `${payBase}/${body.data.authority}`,
    } satisfies ShopPaymentStartResult;
  });

/**
 * مصالحه وضعیت سفارش پس از بازگشت از درگاه (idempotent).
 * اگر کال‌بک عمومی پرداخت را تسویه کرده باشد، فقط سفارش paid می‌شود؛
 * در غیر این صورت verify مستقل زرین‌پال انجام و با RPC افزایشی ثبت می‌شود.
 */
export const reconcileShopPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as MinimalClient;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: payments, error: payError } = await supabaseAdmin
      .from("payments")
      .select("id, amount, currency, status, authority, ref_id, user_id, gateway_meta")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (payError) throw new Error(payError.message);

    const payment = (payments ?? []).find((row) => {
      const meta = (row.gateway_meta ?? {}) as Record<string, unknown>;
      return meta["order_id"] === data.orderId;
    });

    const settled = ["paid", "verified", "completed"];
    if (payment && payment.authority && !settled.includes(String(payment.status))) {
      // verify مستقل (سیستم پرداخت موجود تغییر نمی‌کند).
      const settings = await loadGatewaySettings();
      const endpoint = settings.sandbox
        ? "https://sandbox.zarinpal.com/pg/v4/payment/verify.json"
        : "https://payment.zarinpal.com/pg/v4/payment/verify.json";
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          merchant_id: merchantOf(settings),
          amount: payment.amount,
          authority: payment.authority,
        }),
      });
      const body = (await resp.json()) as {
        data?: { code?: number; ref_id?: number | string; card_pan?: string };
      };
      const code = body.data?.code;
      if (code === 100 || code === 101) {
        const { error: finalizeError } = await sb.rpc("shop_finalize_payment", {
          p_payment_id: payment.id,
          p_ref_id: String(body.data?.ref_id ?? ""),
          p_amount: payment.amount,
          p_card_pan: body.data?.card_pan ?? null,
        });
        if (finalizeError) throw new Error(finalizeError.message);
      }
    }

    const { data: confirmed, error: confirmError } = await sb.rpc("shop_confirm_order_payment", {
      p_order_id: data.orderId,
    });
    if (confirmError) throw new Error(confirmError.message);
    const result = (confirmed ?? {}) as { status?: string; ref_id?: string | null };

    // ارسال خودکار لینک محصولات پس از پرداخت (idempotent، خطا مانع پاسخ نمی‌شود).
    if (result.status === "paid") {
      try {
        const { deliverShopOrderLinks } = await import("@/lib/shop-delivery.server");
        await deliverShopOrderLinks(data.orderId);
      } catch (error) {
        console.error("[shop-delivery]", error);
      }
    }

    return {
      order_status: result.status ?? "pending",
      ref_id: result.ref_id ?? payment?.ref_id ?? null,
    } satisfies ShopPaymentReconcileResult;
  });
