import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type RefundResponse = {
  ok: boolean;
  refund_id: string | null;
  status: "succeeded" | "failed" | "pending";
  idempotent: boolean;
  mode: "api" | "manual" | null;
  error_code: string | null;
};

export type PaymentRefundRow = {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  provider_reference: string | null;
  error_code: string | null;
  reason: string | null;
  created_at: string;
  completed_at: string | null;
};

const refundSchema = z.object({
  payment_id: z.string().uuid(),
  amount: z.number().finite().positive(),
  reason: z.string().trim().min(5).max(300),
  idempotency_key: z.string().trim().min(8).max(120),
  provider_reference: z.string().trim().max(120).nullable().optional(),
});

const listRefundsSchema = z.object({ payment_id: z.string().uuid() });

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

async function callRpc<T>(
  supabase: MinimalClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/**
 * Refunds are two-phase and idempotent:
 * 1. `admin_begin_refund` validates amount/state and reserves a pending row
 *    keyed by the caller's idempotency key (retries return the same row).
 * 2. The gateway adapter runs, then `admin_finalize_refund` commits the money
 *    movement and writes the audit entry. Nothing is mutated client-side.
 */
export const refundPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => refundSchema.parse(input))
  .handler(async ({ data, context }): Promise<RefundResponse> => {
    const supabase = context.supabase as unknown as MinimalClient;
    await assertAdmin(supabase);

    const begin = await callRpc<{
      refund_id: string;
      idempotent: boolean;
      status: string;
      amount: number;
      currency: string;
      gateway: string;
    }>(supabase, "admin_begin_refund", {
      p_payment_id: data.payment_id,
      p_amount: data.amount,
      p_reason: data.reason,
      p_idempotency_key: data.idempotency_key,
    });

    if (begin.idempotent && begin.status !== "pending") {
      return {
        ok: begin.status === "succeeded",
        refund_id: begin.refund_id,
        status: begin.status as RefundResponse["status"],
        idempotent: true,
        mode: null,
        error_code: null,
      };
    }

    const { executeRefund } = await import("./payment.server");
    const outcome = await executeRefund({
      gateway: begin.gateway,
      amount: Number(begin.amount),
      currency: begin.currency,
      providerReference: data.provider_reference ?? null,
    });

    await callRpc(supabase, "admin_finalize_refund", {
      p_refund_id: begin.refund_id,
      p_success: outcome.ok,
      p_provider_reference: outcome.provider_reference,
      p_error_code: outcome.error_code,
    });

    if (!outcome.ok) {
      await supabase.rpc("admin_log_error", {
        p_severity: "error",
        p_source: "payments",
        p_message: `بازپرداخت ناموفق بود (${outcome.error_code})`,
        p_error_code: outcome.error_code,
        p_operation: "refund",
        p_correlation_id: begin.refund_id,
        p_metadata: { gateway: begin.gateway, amount: begin.amount },
      });
    }

    return {
      ok: outcome.ok,
      refund_id: begin.refund_id,
      status: outcome.ok ? "succeeded" : "failed",
      idempotent: false,
      mode: outcome.mode,
      error_code: outcome.error_code,
    };
  });

export const listPaymentRefunds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listRefundsSchema.parse(input))
  .handler(async ({ data, context }): Promise<PaymentRefundRow[]> => {
    const supabase = context.supabase;
    await assertAdmin(supabase as unknown as MinimalClient);
    const { data: rows, error } = await supabase
      .from("payment_refunds")
      .select(
        "id,payment_id,amount,currency,provider,status,provider_reference,error_code,reason,created_at,completed_at",
      )
      .eq("payment_id", data.payment_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as PaymentRefundRow[];
  });
