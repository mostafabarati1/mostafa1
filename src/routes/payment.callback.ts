import { createFileRoute } from "@tanstack/react-router";
import { getAppUrl } from "@/lib/server-env";
import {
  buildResultUrl,
  isSettled,
  sanitizeAuthority,
  sanitizeRefId,
  type ResultStatus,
} from "@/lib/payments/callback-utils";

const ZARINPAL_SANDBOX_MERCHANT = "1344b5d4-004b-4e48-bc24-5b6c79c2416b";
const VERIFY_TIMEOUT_MS = 15_000;

function resultRedirect(origin: string, status: ResultStatus, ref?: string | null): Response {
  return Response.redirect(buildResultUrl(origin, status, ref), 302);
}

export const Route = createFileRoute("/payment/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Origin فقط از پیکربندی مجاز ساخته می‌شود، نه از URL درخواست.
        let origin: string;
        try {
          origin = getAppUrl();
        } catch (configError) {
          console.error("[payment-callback] configuration error:", configError);
          return new Response("Payment callback is not configured", { status: 500 });
        }

        const url = new URL(request.url);
        const authority = sanitizeAuthority(url.searchParams.get("Authority"));
        const status = url.searchParams.get("Status");

        if (!authority) {
          return resultRedirect(origin, "missing");
        }

        let supabaseAdmin: Awaited<
          typeof import("@/integrations/supabase/client.server")
        >["supabaseAdmin"];
        try {
          ({ supabaseAdmin } = await import("@/integrations/supabase/client.server"));
        } catch (configError) {
          console.error("[payment-callback] supabase config error:", configError);
          return new Response("Payment callback is not configured", { status: 500 });
        }

        // ۱) پرداخت را با authority بخوان (مبلغ همیشه از رکورد سرور می‌آید).
        const { data: pay, error: payError } = await supabaseAdmin
          .from("payments")
          .select("id, amount, currency, gateway, status, ref_id")
          .eq("authority", authority)
          .maybeSingle();

        if (payError) {
          console.error("[payment-callback] payment lookup failed:", payError.message);
          return resultRedirect(origin, "error");
        }
        if (!pay) {
          return resultRedirect(origin, "not_found");
        }

        // ۲) Idempotency: اگر قبلاً نهایی شده، همان نتیجه قبلی برگردد.
        if (isSettled(pay.status)) {
          return resultRedirect(origin, "success", sanitizeRefId(pay.ref_id));
        }
        if (pay.status === "refunded") {
          return resultRedirect(origin, "failed");
        }

        // ۳) لغو توسط کاربر.
        if (status !== "OK") {
          const { error: failError } = await supabaseAdmin.rpc("mark_gateway_payment_failed", {
            p_payment_id: pay.id,
            p_status: "cancelled",
            p_reason: "User cancelled at gateway",
          });
          if (failError) {
            console.error("[payment-callback] mark cancelled failed:", failError.message);
          }
          return resultRedirect(origin, "cancelled");
        }

        // ۴) تنظیمات درگاه.
        const { data: settings, error: settingsError } = await supabaseAdmin
          .from("payment_gateway_settings")
          .select("merchant_id, sandbox, currency")
          .maybeSingle();
        if (settingsError || !settings) {
          console.error(
            "[payment-callback] gateway settings unavailable:",
            settingsError?.message ?? "no row",
          );
          return resultRedirect(origin, "pending");
        }

        const merchantId =
          settings.merchant_id || (settings.sandbox ? ZARINPAL_SANDBOX_MERCHANT : "");
        if (!merchantId) {
          console.error("[payment-callback] merchant id is not configured");
          return resultRedirect(origin, "pending");
        }

        const endpoint = settings.sandbox
          ? "https://sandbox.zarinpal.com/pg/v4/payment/verify.json"
          : "https://payment.zarinpal.com/pg/v4/payment/verify.json";

        // ۵) Verify با timeout و مدیریت خطای شبکه/JSON خراب.
        let verifyBody: {
          data?: { code?: number; ref_id?: string | number; card_pan?: string; message?: string };
          errors?: { code?: number; message?: string } | unknown[];
        } | null = null;
        let verifyOk = false;
        let httpStatus = 0;

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
          const verifyResp = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              merchant_id: merchantId,
              amount: pay.amount,
              authority,
              currency: pay.currency === "IRT" ? "IRT" : "IRR",
            }),
            signal: controller.signal,
          });
          clearTimeout(timer);
          httpStatus = verifyResp.status;
          verifyOk = verifyResp.ok;
          const text = await verifyResp.text();
          try {
            verifyBody = text ? JSON.parse(text) : null;
          } catch {
            verifyBody = null;
          }
        } catch (networkError) {
          console.error("[payment-callback] verify request failed:", networkError);
          // پرداخت ممکن است در درگاه موفق باشد؛ وضعیت را ناموفق ثبت نمی‌کنیم.
          return resultRedirect(origin, "pending");
        }

        if (!verifyBody) {
          console.error("[payment-callback] invalid verify response, http:", httpStatus);
          return resultRedirect(origin, "pending");
        }

        const code = verifyBody.data?.code;

        // ZarinPal: 100 پرداخت موفق، 101 قبلاً verify شده.
        if (verifyOk && (code === 100 || code === 101)) {
          const refId = sanitizeRefId(verifyBody.data?.ref_id);
          const { error: finalizeError } = await supabaseAdmin.rpc("finalize_gateway_payment", {
            p_payment_id: pay.id,
            p_ref_id: refId ?? "",
            p_amount: pay.amount,
            p_card_pan: verifyBody.data?.card_pan ?? "",
          });

          if (finalizeError) {
            console.error("[payment-callback] finalize failed:", finalizeError.message);
            // پرداخت در درگاه موفق بوده اما نهایی‌سازی نشده: صفحه موفقیت نشان نده.
            return resultRedirect(origin, "pending", refId);
          }

          // تأیید نهایی از روی وضعیت واقعی رکورد.
          const { data: confirmed, error: confirmError } = await supabaseAdmin
            .from("payments")
            .select("status, ref_id")
            .eq("id", pay.id)
            .maybeSingle();

          if (confirmError || !confirmed || !isSettled(confirmed.status)) {
            console.error(
              "[payment-callback] payment not settled after finalize:",
              confirmError?.message ?? confirmed?.status,
            );
            return resultRedirect(origin, "pending", refId);
          }

          return resultRedirect(origin, "success", sanitizeRefId(confirmed.ref_id) ?? refId);
        }

        const reason =
          typeof verifyBody.data?.message === "string"
            ? verifyBody.data.message.slice(0, 200)
            : `code ${code ?? httpStatus}`;

        const { error: failError } = await supabaseAdmin.rpc("mark_gateway_payment_failed", {
          p_payment_id: pay.id,
          p_status: "failed",
          p_reason: reason,
        });
        if (failError) {
          console.error("[payment-callback] mark failed error:", failError.message);
        }
        return resultRedirect(origin, "failed");
      },
    },
  },
});
