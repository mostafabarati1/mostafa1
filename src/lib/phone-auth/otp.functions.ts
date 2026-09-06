import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { normalizeIranMobile } from "./phone";

const requestSchema = z.object({ phone: z.string() });
const verifySchema = z.object({
  phone: z.string(),
  code: z.string(),
  fullName: z.string().trim().max(120).optional(),
  referredBy: z.string().trim().max(36).optional(),
});

export type RequestOtpResult = {
  ok: boolean;
  message: string;
  retryAfterSeconds: number;
  expiresInSeconds: number;
  /** Present only in mock/test SMS mode. */
  devCode?: string | null;
};

export type VerifyOtpResult = {
  ok: boolean;
  message: string;
  /** Exchange with supabase.auth.verifyOtp({ type: "email", token_hash }). */
  tokenHash?: string;
  isNewUser?: boolean;
};

export const requestOtp = createServerFn({ method: "POST" })
  .validator((data: unknown) => requestSchema.parse(data))
  .handler(async ({ data }): Promise<RequestOtpResult> => {
    const phone = normalizeIranMobile(data.phone);
    if (!phone) {
      return {
        ok: false,
        message: "شماره موبایل معتبر نیست.",
        retryAfterSeconds: 0,
        expiresInSeconds: 0,
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      OTP_TTL_SECONDS,
      OTP_RESEND_SECONDS,
      checkAndTouchRateLimit,
      generateOtpCode,
      hashOtp,
      sendOtpSms,
    } = await import("./otp.server");

    const limit = await checkAndTouchRateLimit(phone);
    if (!limit.ok) {
      return {
        ok: false,
        message: limit.message ?? "لطفاً کمی بعد دوباره تلاش کنید.",
        retryAfterSeconds: limit.retryAfterSeconds,
        expiresInSeconds: 0,
      };
    }

    const code = generateOtpCode();
    const codeHash = await hashOtp(code);

    const { error } = await supabaseAdmin.from("otp_codes").insert({
      phone_e164: phone,
      code_hash: codeHash,
      expires_at: new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString(),
    });
    if (error) {
      // DEBUG: log the real Postgres/Supabase error to the server terminal
      console.error("[otp] insert failed:", JSON.stringify(error, null, 2));
      return {
        ok: false,
        message: "ثبت کد تأیید ناموفق بود. دوباره تلاش کنید.",
        retryAfterSeconds: 0,
        expiresInSeconds: 0,
      };
    }

    const sms = await sendOtpSms(phone, code);
    if (sms.status === "failed") {
      return {
        ok: false,
        message: "ارسال پیامک ناموفق بود. کمی بعد دوباره تلاش کنید.",
        retryAfterSeconds: 0,
        expiresInSeconds: 0,
      };
    }

    return {
      ok: true,
      message:
        sms.provider === "mock"
          ? "حالت آزمایشی پیامک فعال است؛ کد در همین صفحه نمایش داده می‌شود."
          : "کد تأیید پیامک شد.",
      retryAfterSeconds: OTP_RESEND_SECONDS,
      expiresInSeconds: OTP_TTL_SECONDS,
      devCode: sms.devCode,
    };
  });

export const verifyOtp = createServerFn({ method: "POST" })
  .validator((data: unknown) => verifySchema.parse(data))
  .handler(async ({ data }): Promise<VerifyOtpResult> => {
    const phone = normalizeIranMobile(data.phone);
    const code = data.code.trim();
    if (!phone || !/^\d{6}$/.test(code)) {
      return { ok: false, message: "شماره یا کد وارد شده معتبر نیست." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyOtpHash, ensurePhoneUser, mintSessionToken } = await import("./otp.server");

    const { data: row, error: selectError } = await supabaseAdmin
      .from("otp_codes")
      .select("id, code_hash, attempts, max_attempts, expires_at, consumed_at")
      .eq("phone_e164", phone)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (selectError) {
      // DEBUG: log the real Postgres/Supabase error to the server terminal
      console.error("[otp] select failed:", JSON.stringify(selectError, null, 2));
    }

    const otp = row as {
      id: string;
      code_hash: string;
      attempts: number;
      max_attempts: number;
      expires_at: string;
    } | null;

    if (!otp) return { ok: false, message: "کدی برای این شماره یافت نشد. دوباره درخواست دهید." };
    if (new Date(otp.expires_at).getTime() < Date.now()) {
      return { ok: false, message: "کد منقضی شده است. کد جدید بگیرید." };
    }
    if (otp.attempts >= otp.max_attempts) {
      return { ok: false, message: "تعداد تلاش‌ها بیش از حد مجاز است. کد جدید بگیرید." };
    }

    const valid = await verifyOtpHash(code, otp.code_hash);
    if (!valid) {
      await supabaseAdmin
        .from("otp_codes")
        .update({ attempts: otp.attempts + 1 })
        .eq("id", otp.id);
      return {
        ok: false,
        message: `کد وارد شده نادرست است. ${Math.max(otp.max_attempts - otp.attempts - 1, 0)} تلاش باقی مانده.`,
      };
    }

    await supabaseAdmin
      .from("otp_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", otp.id);

    try {
      const user = await ensurePhoneUser(phone, data.fullName, data.referredBy);
      const tokenHash = await mintSessionToken(user.email);
      return {
        ok: true,
        message: user.isNew ? "حساب شما ساخته شد." : "خوش آمدید!",
        tokenHash,
        isNewUser: user.isNew,
      };
    } catch (error) {
      console.error("[phone-auth] verify failed", error);
      return { ok: false, message: "ورود ناموفق بود. کمی بعد دوباره تلاش کنید." };
    }
  });
