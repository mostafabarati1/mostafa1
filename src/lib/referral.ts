/**
 * ابزارهای مشترک ماژول دعوت (Invite & Referral).
 *
 * توابع RPC این ماژول (`referral_info` و `redeem_referral`) در فایل تایپ‌های
 * تولیدشده Supabase وجود ندارند، بنابراین فراخوانی آن‌ها از طریق یک پوشش
 * (wrapper) تایپ‌شده در همین فایل انجام می‌شود تا بقیه کد تمیز بماند.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9]{6,12}$/;

export type ReferralInfo = {
  ok: boolean;
  message?: string;
  referrer_id?: string;
  referrer_name?: string;
};

export type RedeemReferralResult = {
  ok: boolean;
  already?: boolean;
  days?: number;
  referrer_name?: string;
  message?: string;
};

type UntypedRpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

function rpc(client: SupabaseClient<never> | { rpc: unknown }): UntypedRpc {
  return (client as { rpc: UntypedRpc }).rpc.bind(client) as UntypedRpc;
}

export async function fetchReferralInfo(
  client: { rpc: unknown },
  code: string,
): Promise<ReferralInfo> {
  const { data, error } = await rpc(client)("referral_info", { p_code: code });
  if (error) throw new Error(error.message);
  return (data as ReferralInfo | null) ?? { ok: false };
}

export async function redeemReferral(
  client: { rpc: unknown },
  code: string,
  userId: string,
): Promise<RedeemReferralResult> {
  const { data, error } = await rpc(client)("redeem_referral", {
    p_code: code,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  return (data as RedeemReferralResult | null) ?? { ok: false };
}
