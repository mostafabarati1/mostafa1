import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const MAX_BULK_RECIPIENTS = 100;
const SEND_DELAY_MS = 250;
const DEDUPE_WINDOW_MINUTES = 30;

export type AdminSmsSettings = {
  provider: string;
  enabled: boolean;
  test_mode: boolean;
  sender_line: string | null;
  verify_template_id: string | null;
  welcome_template_id: string | null;
  api_key_masked: string | null;
  has_api_key: boolean;
  updated_at: string | null;
};

export type SmsSendSummary = {
  campaign_id: string | null;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  test_mode: boolean;
  invalid: string[];
  results: { mobile_masked: string; status: "sent" | "failed" | "skipped"; error: string | null }[];
};

export type SmsCampaignRow = {
  id: string;
  title: string | null;
  message: string;
  provider: string;
  test_mode: boolean;
  audience: string;
  total_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
};

const saveSchema = z.object({
  provider: z.string().min(1).max(40),
  enabled: z.boolean(),
  test_mode: z.boolean(),
  sender_line: z.string().trim().max(40).nullable().optional(),
  verify_template_id: z.string().trim().max(80).nullable().optional(),
  welcome_template_id: z.string().trim().max(80).nullable().optional(),
  /** Only sent when the admin wants to replace the stored key. */
  api_key: z.string().trim().min(8).max(300).nullable().optional(),
});

const sendSchema = z.object({
  message: z.string().trim().min(1).max(600),
  title: z.string().trim().max(120).nullable().optional(),
  audience: z.enum(["manual", "active_users"]),
  recipients: z.array(z.string().trim().min(5).max(20)).max(MAX_BULK_RECIPIENTS).default([]),
});

async function assertAdmin(supabase: {
  rpc: (fn: "is_admin") => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}) {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("دسترسی مدیر لازم است");
}

function maskKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 4) return "••••";
  return `••••••••${key.slice(-4)}`;
}

export const getAdminSmsSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminSmsSettings> => {
    const { supabase } = context;
    await assertAdmin(supabase);
    const { data, error } = await supabase
      .from("sms_settings")
      .select(
        "provider,enabled,test_mode,sender_line,verify_template_id,welcome_template_id,api_key,updated_at",
      )
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as {
      provider: string;
      enabled: boolean;
      test_mode: boolean;
      sender_line: string | null;
      verify_template_id: string | null;
      welcome_template_id: string | null;
      api_key: string | null;
      updated_at: string;
    } | null;
    return {
      provider: row?.provider ?? "kavenegar",
      enabled: Boolean(row?.enabled),
      test_mode: row?.test_mode ?? true,
      sender_line: row?.sender_line ?? null,
      verify_template_id: row?.verify_template_id ?? null,
      welcome_template_id: row?.welcome_template_id ?? null,
      api_key_masked: maskKey(row?.api_key ?? null),
      has_api_key: Boolean(row?.api_key),
      updated_at: row?.updated_at ?? null,
    };
  });

export const saveAdminSmsSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase);

    const payload: Record<string, unknown> = {
      id: true,
      provider: data.provider,
      enabled: data.enabled,
      test_mode: data.test_mode,
      sender_line: data.sender_line?.trim() || null,
      verify_template_id: data.verify_template_id?.trim() || null,
      welcome_template_id: data.welcome_template_id?.trim() || null,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    };
    if (data.api_key) payload["api_key"] = data.api_key;

    const { error } = await supabase
      .from("sms_settings")
      .upsert(payload as never, { onConflict: "id" });
    if (error) throw new Error(error.message);

    await supabase.rpc("log_audit", {
      _action: "update",
      _entity: "sms_settings",
      _entity_id: null as unknown as string,
      _details: {
        provider: data.provider,
        enabled: data.enabled,
        test_mode: data.test_mode,
        api_key_changed: Boolean(data.api_key),
      },
    });

    return { ok: true };
  });

export const listSmsCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SmsCampaignRow[]> => {
    const { supabase } = context;
    await assertAdmin(supabase);
    const { data, error } = await supabase
      .from("sms_campaigns")
      .select(
        "id,title,message,provider,test_mode,audience,total_count,sent_count,failed_count,skipped_count,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as SmsCampaignRow[];
  });

export const sendAdminSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => sendSchema.parse(input))
  .handler(async ({ data, context }): Promise<SmsSendSummary> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase);

    const { normalizeMobile, maskMobile, sendPlainSms, delay } = await import("./sms.server");

    const settingsRes = await supabase
      .from("sms_settings")
      .select("provider,enabled,test_mode,api_key,sender_line")
      .limit(1)
      .maybeSingle();
    if (settingsRes.error) throw new Error(settingsRes.error.message);
    const settingsRow = settingsRes.data as {
      provider: string;
      enabled: boolean;
      test_mode: boolean;
      api_key: string | null;
      sender_line: string | null;
    } | null;
    const settings = {
      provider: settingsRow?.provider ?? "kavenegar",
      enabled: Boolean(settingsRow?.enabled),
      test_mode: settingsRow?.test_mode ?? true,
      api_key: settingsRow?.api_key ?? null,
      sender_line: settingsRow?.sender_line ?? null,
    };

    // Resolve recipients
    const invalid: string[] = [];
    let mobiles: string[] = [];
    if (data.audience === "active_users") {
      const { data: rows, error } = await supabase
        .from("profiles")
        .select("mobile")
        .eq("status", "active")
        .not("mobile", "is", null)
        .limit(MAX_BULK_RECIPIENTS);
      if (error) throw new Error(error.message);
      mobiles = (rows ?? [])
        .map((r) => normalizeMobile(String((r as { mobile: string | null }).mobile ?? "")))
        .filter((m): m is string => !!m);
    } else {
      for (const raw of data.recipients) {
        const normalized = normalizeMobile(raw);
        if (normalized) mobiles.push(normalized);
        else invalid.push(raw);
      }
    }
    mobiles = Array.from(new Set(mobiles)).slice(0, MAX_BULK_RECIPIENTS);

    if (mobiles.length === 0) {
      throw new Error("هیچ شماره معتبری برای ارسال یافت نشد");
    }

    const campaignRes = await supabase
      .from("sms_campaigns")
      .insert({
        title: data.title?.trim() || null,
        message: data.message,
        provider: settings.provider,
        test_mode: settings.test_mode || !settings.enabled,
        audience: data.audience,
        total_count: mobiles.length,
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (campaignRes.error) throw new Error(campaignRes.error.message);
    const campaignId = (campaignRes.data as { id: string }).id;

    // 30-minute de-duplication on the same number + message
    const since = new Date(Date.now() - DEDUPE_WINDOW_MINUTES * 60_000).toISOString();
    const dedupeKeys = mobiles.map((m) => `${m}:${data.message}`);
    const recentRes = await supabase
      .from("sms_delivery_logs")
      .select("dedupe_key")
      .in("dedupe_key", dedupeKeys)
      .gte("created_at", since);
    const alreadySent = new Set(
      ((recentRes.data ?? []) as { dedupe_key: string | null }[])
        .map((r) => r.dedupe_key)
        .filter((k): k is string => !!k),
    );

    const results: SmsSendSummary["results"] = [];
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < mobiles.length; i++) {
      const mobile = mobiles[i]!;
      const dedupeKey = `${mobile}:${data.message}`;
      const masked = maskMobile(mobile);

      if (alreadySent.has(dedupeKey)) {
        skipped++;
        results.push({ mobile_masked: masked, status: "skipped", error: "ارسال تکراری" });
        continue;
      }

      const result = await sendPlainSms(settings, mobile, data.message);
      if (result.status === "sent") sent++;
      else failed++;
      results.push({
        mobile_masked: masked,
        status: result.status,
        error: result.error,
      });

      await supabase.from("sms_delivery_logs").insert({
        campaign_id: campaignId,
        mobile_masked: masked,
        purpose: "campaign",
        message: data.message,
        provider_status: result.providerStatus,
        success: result.status === "sent",
        error_message: result.error,
        dedupe_key: dedupeKey,
        sent_by: userId,
      } as never);

      alreadySent.add(dedupeKey);
      if (i < mobiles.length - 1) await delay(SEND_DELAY_MS);
    }

    await supabase
      .from("sms_campaigns")
      .update({ sent_count: sent, failed_count: failed, skipped_count: skipped } as never)
      .eq("id", campaignId);

    await supabase.rpc("log_audit", {
      _action: "create",
      _entity: "sms_campaigns",
      _entity_id: campaignId,
      _details: { total: mobiles.length, sent, failed, skipped, audience: data.audience },
    });

    return {
      campaign_id: campaignId,
      total: mobiles.length,
      sent,
      failed,
      skipped,
      test_mode: settings.test_mode || !settings.enabled,
      invalid,
      results,
    };
  });
