/**
 * Server-only refund adapters.
 *
 * Iranian gateways (Zarinpal and friends) expose no public automated refund
 * API for standard merchant accounts, so a refund is completed out of band by
 * the merchant and recorded here with the bank/gateway reference the admin
 * received. The adapter contract keeps room for real API refunds later.
 */
export type RefundOutcome = {
  ok: boolean;
  mode: "api" | "manual";
  provider_reference: string | null;
  error_code: string | null;
};

export type RefundRequest = {
  gateway: string;
  amount: number;
  currency: string;
  providerReference: string | null;
};

const MANUAL_GATEWAYS = new Set(["zarinpal", "manual", "offline", "bank_transfer"]);

export async function executeRefund(req: RefundRequest): Promise<RefundOutcome> {
  const gateway = (req.gateway || "").toLowerCase();

  if (MANUAL_GATEWAYS.has(gateway)) {
    const reference = req.providerReference?.trim() || "";
    if (!reference) {
      return {
        ok: false,
        mode: "manual",
        provider_reference: null,
        error_code: "provider_reference_required",
      };
    }
    return { ok: true, mode: "manual", provider_reference: reference, error_code: null };
  }

  return {
    ok: false,
    mode: "api",
    provider_reference: null,
    error_code: "refund_not_supported_for_gateway",
  };
}

export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = String(value);
  if (v.length <= 4) return "••••";
  return `••••••••${v.slice(-4)}`;
}
