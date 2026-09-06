// Server-only SMS helpers for the admin panel. Never import from client code.
// Provider API keys are read here and never returned to the browser.

export type SmsProviderSettings = {
  provider: string;
  enabled: boolean;
  test_mode: boolean;
  api_key: string | null;
  sender_line: string | null;
};

export type PlainSmsResult = {
  status: "sent" | "failed";
  providerMessageId: string | null;
  providerStatus: number | null;
  error: string | null;
};

/** Normalizes an Iranian mobile number to the local 09xxxxxxxxx form. */
export function normalizeMobile(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  let local = digits;
  if (local.startsWith("+98")) local = `0${local.slice(3)}`;
  else if (local.startsWith("0098")) local = `0${local.slice(4)}`;
  else if (local.startsWith("98") && local.length === 12) local = `0${local.slice(2)}`;
  else if (local.startsWith("9") && local.length === 10) local = `0${local}`;
  if (!/^09\d{9}$/.test(local)) return null;
  return local;
}

export function maskMobile(local: string): string {
  return `${local.slice(0, 4)}***${local.slice(-3)}`;
}

async function sendViaKavenegar(
  apiKey: string,
  receptor: string,
  message: string,
  sender: string | null,
): Promise<PlainSmsResult> {
  const params = new URLSearchParams({ receptor, message });
  if (sender) params.set("sender", sender);
  try {
    const res = await fetch(`https://api.kavenegar.com/v1/${apiKey}/sms/send.json`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const json = (await res.json()) as {
      return?: { status?: number; message?: string };
      entries?: Array<{ messageid?: number }>;
    };
    const status = json.return?.status ?? res.status;
    if (!res.ok || status !== 200) {
      return {
        status: "failed",
        providerMessageId: null,
        providerStatus: status,
        error: json.return?.message ?? `HTTP ${res.status}`,
      };
    }
    return {
      status: "sent",
      providerMessageId: json.entries?.[0]?.messageid?.toString() ?? null,
      providerStatus: 200,
      error: null,
    };
  } catch (error) {
    return {
      status: "failed",
      providerMessageId: null,
      providerStatus: null,
      error: error instanceof Error ? error.message : "network error",
    };
  }
}

async function sendViaSmsIr(
  apiKey: string,
  mobile: string,
  message: string,
  sender: string | null,
): Promise<PlainSmsResult> {
  try {
    const res = await fetch("https://api.sms.ir/v1/send/bulk", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/plain", "x-api-key": apiKey },
      body: JSON.stringify({
        lineNumber: sender ? Number(sender) : undefined,
        messageText: message,
        mobiles: [mobile],
      }),
    });
    const json = (await res.json()) as { status?: number; message?: string; data?: unknown };
    if (!res.ok || json.status !== 1) {
      return {
        status: "failed",
        providerMessageId: null,
        providerStatus: json.status ?? res.status,
        error: json.message ?? `HTTP ${res.status}`,
      };
    }
    return {
      status: "sent",
      providerMessageId: json.data != null ? String(json.data) : null,
      providerStatus: 1,
      error: null,
    };
  } catch (error) {
    return {
      status: "failed",
      providerMessageId: null,
      providerStatus: null,
      error: error instanceof Error ? error.message : "network error",
    };
  }
}

/** Sends one plain-text SMS with the configured provider; mock in test mode. */
export async function sendPlainSms(
  settings: SmsProviderSettings,
  mobile: string,
  message: string,
): Promise<PlainSmsResult> {
  const apiKey = settings.api_key ?? "";
  const live = settings.enabled && !settings.test_mode && !!apiKey;
  if (!live) {
    return { status: "sent", providerMessageId: null, providerStatus: null, error: null };
  }
  const provider = settings.provider.toLowerCase();
  if (provider === "kavenegar") {
    return sendViaKavenegar(apiKey, mobile, message, settings.sender_line);
  }
  if (provider === "smsir" || provider === "sms.ir") {
    return sendViaSmsIr(apiKey, mobile, message, settings.sender_line);
  }
  return {
    status: "failed",
    providerMessageId: null,
    providerStatus: null,
    error: `ارائه‌دهنده پیامک پشتیبانی نمی‌شود: ${settings.provider}`,
  };
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
