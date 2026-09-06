import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAppUrl } from "@/lib/server-env";
import { buildCallbackUrl } from "@/lib/payments/callback-utils";

const ZARINPAL_SANDBOX_MERCHANT = "1344b5d4-004b-4e48-bc24-5b6c79c2416b";

export type PaymentStartResult = {
  payment_id: string;
  redirect_url: string;
};

/**
 * Creates a ZarinPal payment for a plan on behalf of the signed-in user.
 * - Creates the payment intent as the authenticated user (auth.uid()).
 * - Reads gateway settings with the admin client (settings are locked down).
 * - Requests an authority from ZarinPal and stores it on the payment row.
 */
export const startZarinpalPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ planId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // 1) Payment intent (SECURITY DEFINER; needs the user's auth.uid()).
    const { data: intent, error: intentError } = await supabase.rpc("create_payment_intent", {
      p_plan_id: data.planId,
      p_gateway: "zarinpal",
    });
    if (intentError) throw intentError;
    const intentObj = intent as unknown as {
      payment_id: string;
      amount: number;
      currency: string;
    };

    // 2) Gateway settings (service role — table is fully locked down).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("payment_gateway_settings")
      .select("merchant_id, sandbox, callback_path, currency, enabled")
      .single();
    if (settingsError) throw new Error("Payment gateway is not configured");
    if (!settings.enabled) throw new Error("Payment gateway is disabled");

    // APP_URL باید صریحاً پیکربندی شود؛ هیچ fallback به آدرس preview وجود ندارد.
    const origin = getAppUrl();
    const callbackUrl = buildCallbackUrl(origin, settings.callback_path);
    const merchantId = settings.merchant_id || (settings.sandbox ? ZARINPAL_SANDBOX_MERCHANT : "");
    if (!merchantId) throw new Error("Merchant ID is not configured");

    const endpoint = settings.sandbox
      ? "https://sandbox.zarinpal.com/pg/v4/payment/request.json"
      : "https://payment.zarinpal.com/pg/v4/payment/request.json";

    // 3) Request authority from ZarinPal.
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant_id: merchantId,
        amount: intentObj.amount,
        currency: intentObj.currency === "IRT" ? "IRT" : "IRR",
        callback_url: callbackUrl,
        description: "خرید اشتراک همراه استخدام",
      }),
    });
    const body = (await resp.json()) as {
      data?: { authority: string; code?: number; fee?: number };
      errors?: { code?: number; message?: string };
    };
    if (!resp.ok || !body.data?.authority) {
      throw new Error(
        `خطا در اتصال به درگاه پرداخت (${body.errors?.code ?? body.data?.code ?? resp.status})`,
      );
    }

    // 4) Persist authority on the payment.
    const { error: updateError } = await supabaseAdmin
      .from("payments")
      .update({ authority: body.data.authority, status: "processing" })
      .eq("id", intentObj.payment_id);
    if (updateError) throw updateError;

    const payBase = settings.sandbox
      ? "https://sandbox.zarinpal.com/pg/StartPay"
      : "https://payment.zarinpal.com/pg/StartPay";
    return {
      payment_id: intentObj.payment_id,
      redirect_url: `${payBase}/${body.data.authority}`,
    } satisfies PaymentStartResult;
  });
