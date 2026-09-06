import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type IntegrationStatus = {
  configured: boolean;
  enabled: boolean;
  detail: string;
  secret_masked: string | null;
  updated_at: string | null;
};

export type IntegrationsHealth = {
  sms: IntegrationStatus;
  ai: IntegrationStatus;
  gateway: IntegrationStatus;
  checked_at: string;
};

type MinimalClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

async function assertAdmin(supabase: MinimalClient) {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("دسترسی مدیر لازم است");
}

/**
 * Integration health never leaves the server with raw credentials — only a
 * masked tail plus configured/enabled flags reach the browser.
 */
export const getIntegrationsHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IntegrationsHealth> => {
    const { supabase } = context;
    await assertAdmin(supabase as unknown as MinimalClient);
    const { maskSecret } = await import("./payment.server");

    const [smsRes, aiRes, gwRes] = await Promise.all([
      supabase
        .from("sms_settings")
        .select("provider,enabled,test_mode,api_key,updated_at")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("ai_settings")
        .select("provider,model,api_key,cache_enabled,updated_at")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("payment_gateway_settings")
        .select("gateway,enabled,sandbox,merchant_id,currency,updated_at")
        .limit(1)
        .maybeSingle(),
    ]);

    const sms = smsRes.data as {
      provider: string;
      enabled: boolean;
      test_mode: boolean;
      api_key: string | null;
      updated_at: string | null;
    } | null;
    const ai = aiRes.data as {
      provider: string;
      model: string;
      api_key: string | null;
      cache_enabled: boolean;
      updated_at: string | null;
    } | null;
    const gw = gwRes.data as {
      gateway: string;
      enabled: boolean;
      sandbox: boolean;
      merchant_id: string | null;
      currency: string;
      updated_at: string | null;
    } | null;

    return {
      sms: {
        configured: Boolean(sms?.api_key),
        enabled: Boolean(sms?.enabled),
        detail: sms
          ? `${sms.provider}${sms.test_mode ? " — حالت آزمایشی" : ""}`
          : "پیکربندی نشده است",
        secret_masked: maskSecret(sms?.api_key ?? null),
        updated_at: sms?.updated_at ?? null,
      },
      ai: {
        configured: Boolean(ai),
        enabled: Boolean(ai?.model),
        detail: ai ? `${ai.provider} / ${ai.model}` : "پیکربندی نشده است",
        secret_masked: maskSecret(ai?.api_key ?? null),
        updated_at: ai?.updated_at ?? null,
      },
      gateway: {
        configured: Boolean(gw?.merchant_id),
        enabled: Boolean(gw?.enabled),
        detail: gw
          ? `${gw.gateway}${gw.sandbox ? " — سندباکس" : ""} (${gw.currency})`
          : "پیکربندی نشده است",
        secret_masked: maskSecret(gw?.merchant_id ?? null),
        updated_at: gw?.updated_at ?? null,
      },
      checked_at: new Date().toISOString(),
    };
  });
