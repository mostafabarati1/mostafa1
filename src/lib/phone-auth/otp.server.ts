// Server-only helpers for phone (SMS) OTP login. Never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const OTP_TTL_SECONDS = 120;
export const OTP_RESEND_SECONDS = 60;
export const OTP_MAX_PER_HOUR = 5;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

/** Salted SHA-256 hash, stored as `salt:hash`. The raw code is never persisted. */
export async function hashOtp(code: string, salt?: string): Promise<string> {
  const useSalt = salt ?? bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  return `${useSalt}:${await sha256Hex(`${useSalt}:${code}`)}`;
}

export async function verifyOtpHash(code: string, stored: string): Promise<boolean> {
  const [salt] = stored.split(":");
  if (!salt) return false;
  const computed = await hashOtp(code, salt);
  // constant-time-ish comparison
  if (computed.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}

export function generateOtpCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return n.toString().padStart(6, "0");
}

export type SmsSendResult = {
  provider: string;
  status: "sent" | "failed" | "queued";
  providerMessageId: string | null;
  error: string | null;
  /** Only set in mock/test mode so the developer can complete the flow. */
  devCode: string | null;
};

type SmsSettings = {
  provider: string | null;
  enabled: boolean | null;
  test_mode: boolean | null;
  api_key: string | null;
  verify_template_id: string | null;
};

async function loadSmsSettings(): Promise<SmsSettings | null> {
  const { data } = await supabaseAdmin
    .from("sms_settings")
    .select("provider, enabled, test_mode, api_key, verify_template_id")
    .maybeSingle();
  return (data as SmsSettings | null) ?? null;
}

async function sendViaKavenegar(
  apiKey: string,
  receptor: string,
  code: string,
  template: string,
): Promise<{ id: string | null; error: string | null }> {
  const url = `https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json?receptor=${encodeURIComponent(receptor)}&token=${encodeURIComponent(code)}&template=${encodeURIComponent(template)}`;
  try {
    const res = await fetch(url);
    const json = (await res.json()) as {
      return?: { status?: number; message?: string };
      entries?: Array<{ messageid?: number }>;
    };
    if (!res.ok || json.return?.status !== 200) {
      return { id: null, error: json.return?.message ?? `HTTP ${res.status}` };
    }
    return { id: json.entries?.[0]?.messageid?.toString() ?? null, error: null };
  } catch (error) {
    return { id: null, error: error instanceof Error ? error.message : "network error" };
  }
}

async function sendViaSmsIr(
  apiKey: string,
  mobile: string,
  code: string,
  templateId: string,
): Promise<{ id: string | null; error: string | null }> {
  try {
    const res = await fetch("https://api.sms.ir/v1/send/verify", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/plain", "x-api-key": apiKey },
      body: JSON.stringify({
        mobile,
        templateId: Number(templateId),
        parameters: [{ name: "CODE", value: code }],
      }),
    });
    const json = (await res.json()) as { status?: number; message?: string; data?: unknown };
    if (!res.ok || json.status !== 1) {
      return { id: null, error: json.message ?? `HTTP ${res.status}` };
    }
    return { id: json.data != null ? String(json.data) : null, error: null };
  } catch (error) {
    return { id: null, error: error instanceof Error ? error.message : "network error" };
  }
}

/** Sends the OTP with the configured provider, falling back to mock mode. */
export async function sendOtpSms(phoneE164: string, code: string): Promise<SmsSendResult> {
  const settings = await loadSmsSettings();
  const localMobile = `0${phoneE164.replace(/^\+98/, "")}`;
  const provider = (settings?.provider ?? "mock").toLowerCase();
  const apiKey = settings?.api_key ?? "";
  const template = settings?.verify_template_id ?? "";
  const live = !!settings?.enabled && !settings?.test_mode && !!apiKey && !!template;

  let result: SmsSendResult;
  if (!live) {
    result = {
      provider: "mock",
      status: "sent",
      providerMessageId: null,
      error: null,
      devCode: code,
    };
  } else if (provider === "kavenegar") {
    const r = await sendViaKavenegar(apiKey, localMobile, code, template);
    result = {
      provider,
      status: r.error ? "failed" : "sent",
      providerMessageId: r.id,
      error: r.error,
      devCode: null,
    };
  } else if (provider === "smsir" || provider === "sms.ir") {
    const r = await sendViaSmsIr(apiKey, localMobile, code, template);
    result = {
      provider: "smsir",
      status: r.error ? "failed" : "sent",
      providerMessageId: r.id,
      error: r.error,
      devCode: null,
    };
  } else {
    result = {
      provider,
      status: "failed",
      providerMessageId: null,
      error: `ارائه‌دهنده پیامک پشتیبانی نمی‌شود: ${provider}`,
      devCode: null,
    };
  }

  await supabaseAdmin.from("sms_send_log").insert({
    phone_e164: phoneE164,
    provider: result.provider,
    provider_message_id: result.providerMessageId,
    template: template || null,
    status: result.status,
    error: result.error,
  });

  return result;
}

export type RateLimitResult = { ok: boolean; retryAfterSeconds: number; message?: string };

/** Sliding window rate limit: 1 request / 60s and 5 requests / hour per phone. */
export async function checkAndTouchRateLimit(phoneE164: string): Promise<RateLimitResult> {
  const now = Date.now();
  const { data } = await supabaseAdmin
    .from("phone_login_attempts")
    .select("last_request_at, request_count_1h, blocked_until")
    .eq("phone_e164", phoneE164)
    .maybeSingle();

  const row = data as {
    last_request_at: string;
    request_count_1h: number;
    blocked_until: string | null;
  } | null;

  if (row?.blocked_until && new Date(row.blocked_until).getTime() > now) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((new Date(row.blocked_until).getTime() - now) / 1000),
      message: "به دلیل تلاش‌های زیاد، ارسال کد موقتاً مسدود شده است.",
    };
  }

  if (row) {
    const last = new Date(row.last_request_at).getTime();
    const sinceLast = (now - last) / 1000;
    if (sinceLast < OTP_RESEND_SECONDS) {
      return {
        ok: false,
        retryAfterSeconds: Math.ceil(OTP_RESEND_SECONDS - sinceLast),
        message: "برای ارسال مجدد کد کمی صبر کنید.",
      };
    }
    const withinHour = now - last < 3600_000;
    const count = (withinHour ? row.request_count_1h : 0) + 1;
    if (count > OTP_MAX_PER_HOUR) {
      const blockedUntil = new Date(now + 3600_000).toISOString();
      await supabaseAdmin
        .from("phone_login_attempts")
        .update({
          last_request_at: new Date(now).toISOString(),
          request_count_1h: count,
          blocked_until: blockedUntil,
        })
        .eq("phone_e164", phoneE164);
      return {
        ok: false,
        retryAfterSeconds: 3600,
        message: "تعداد درخواست‌های کد بیش از حد مجاز است. یک ساعت دیگر تلاش کنید.",
      };
    }
    await supabaseAdmin
      .from("phone_login_attempts")
      .update({
        last_request_at: new Date(now).toISOString(),
        request_count_1h: count,
        blocked_until: null,
      })
      .eq("phone_e164", phoneE164);
    return { ok: true, retryAfterSeconds: OTP_RESEND_SECONDS };
  }

  await supabaseAdmin.from("phone_login_attempts").insert({
    phone_e164: phoneE164,
    last_request_at: new Date(now).toISOString(),
    request_count_1h: 1,
  });
  return { ok: true, retryAfterSeconds: OTP_RESEND_SECONDS };
}

/** Deterministic internal auth identity for a phone-only account. */
export function phoneToAuthEmail(phoneE164: string): string {
  return `${phoneE164.replace("+", "")}@phone.hamrah-estekhdam.local`;
}

type FoundUser = { id: string; email: string | undefined };

async function findUserByEmail(email: string): Promise<FoundUser | null> {
  // profiles.email mirrors auth.users.email via the existing signup trigger.
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();
  const row = data as { id: string; email: string | null } | null;
  return row ? { id: row.id, email: row.email ?? email } : null;
}

/**
 * Returns an existing account for this phone or creates one, then makes sure a
 * profile row and the `candidate` role exist.
 */
export async function ensurePhoneUser(
  phoneE164: string,
  fullName?: string,
  /** کد دعوت اختیاری؛ فقط برای حساب‌های تازه‌ساخته‌شده استفاده می‌شود. */
  referredBy?: string,
): Promise<{ userId: string; email: string; isNew: boolean }> {
  const email = phoneToAuthEmail(phoneE164);
  const localMobile = `0${phoneE164.replace(/^\+98/, "")}`;

  let isNew = false;
  let user = await findUserByEmail(email);

  if (!user) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      phone_confirm: false,
      password: bytesToHex(crypto.getRandomValues(new Uint8Array(24))),
      user_metadata: { full_name: fullName ?? "", mobile: localMobile, login_method: "phone_otp" },
    });
    if (error || !data.user) {
      // Race: another request created it a moment ago.
      user = await findUserByEmail(email);
      if (!user) throw new Error(error?.message ?? "ساخت حساب کاربری ناموفق بود.");
    } else {
      isNew = true;
      user = { id: data.user.id, email };
    }
  }

  await supabaseAdmin.from("profiles").upsert(
    {
      id: user.id,
      email,
      mobile: localMobile,
      // Keep an existing chosen name; only fill it for brand-new accounts.
      ...(fullName ? { full_name: fullName } : isNew ? { full_name: "کاربر" } : {}),
    },
    { onConflict: "id" },
  );

  await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: user.id, role: "candidate" }, { onConflict: "user_id,role" });

  // فعال‌سازی هدیه دعوت فقط برای حساب تازه‌ساخته‌شده؛ خطا نباید ثبت‌نام را متوقف کند.
  if (isNew && referredBy) {
    try {
      const { redeemReferral } = await import("@/lib/referral");
      const result = await redeemReferral(supabaseAdmin, referredBy, user.id);
      if (!result.ok) console.error("[referral] redeem rejected:", result.message);
    } catch (error) {
      console.error("[referral] redeem failed", error);
    }
  }

  return { userId: user.id, email, isNew };
}

/**
 * Mints a one-time token the browser can exchange for a real session with
 * `supabase.auth.verifyOtp({ type: "email", token_hash })`.
 */
export async function mintSessionToken(email: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) throw new Error(error?.message ?? "ایجاد نشست ناموفق بود.");
  return tokenHash;
}
