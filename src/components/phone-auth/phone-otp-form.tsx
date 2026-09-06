import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight, Loader2, ShieldCheck, Smartphone } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { requestOtp, verifyOtp } from "@/lib/phone-auth/otp.functions";
import {
  normalizeIranMobile,
  phoneSchema,
  toAsciiDigits,
  toLocalMobile,
  toPersianDigits,
} from "@/lib/phone-auth/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = "phone" | "code";
export type OtpMode = "signin" | "signup";

const codeFormSchema = z.object({
  code: z
    .string()
    .trim()
    .refine((v) => /^\d{6}$/.test(toAsciiDigits(v)), "کد تأیید باید ۶ رقم باشد."),
});

type CodeFormValues = z.infer<typeof codeFormSchema>;

const signupPhoneSchema = phoneSchema.extend({
  fullName: z
    .string()
    .trim()
    .min(3, "نام و نام خانوادگی را کامل وارد کنید.")
    .max(120, "نام بیش از حد طولانی است."),
});

type PhoneFormValues = z.infer<typeof phoneSchema> & { fullName?: string };

function FieldError({ id, message }: { id: string; message?: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

export function PhoneOtpForm({
  destination = "/dashboard",
  mode = "signin",
  referredBy,
}: {
  destination?: string;
  mode?: OtpMode;
  /** کد دعوت معتبر از آدرس /signup?ref=CODE (فقط در حالت ثبت‌نام). */
  referredBy?: string | undefined;
}) {
  const navigate = useNavigate();
  const requestOtpFn = useServerFn(requestOtp);
  const verifyOtpFn = useServerFn(verifyOtp);
  const isSignup = mode === "signup";

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const phoneForm = useForm<PhoneFormValues>({
    resolver: zodResolver(isSignup ? signupPhoneSchema : phoneSchema),
    defaultValues: isSignup ? { phone: "", fullName: "" } : { phone: "" },
  });

  const codeForm = useForm<CodeFormValues>({
    resolver: zodResolver(codeFormSchema),
    defaultValues: { code: "" },
  });

  const sendCode = async (value: string) => {
    setFormError(null);
    const normalized = normalizeIranMobile(value);
    if (!normalized) {
      setFormError("شماره موبایل معتبر نیست.");
      return;
    }
    const result = await requestOtpFn({ data: { phone: normalized } });
    if (!result.ok) {
      setFormError(result.message);
      toast.error(result.message);
      if (result.retryAfterSeconds > 0) setCooldown(result.retryAfterSeconds);
      return;
    }
    setPhone(normalized);
    setDevCode(result.devCode ?? null);
    setCooldown(result.retryAfterSeconds);
    setStep("code");
    codeForm.reset({ code: "" });
    toast.success(result.message);
  };

  const submitPhone = phoneForm.handleSubmit(async (values) => {
    if (isSignup) setFullName((values.fullName ?? "").trim());
    await sendCode(values.phone);
  });

  const submitCode = codeForm.handleSubmit(async (values) => {
    setFormError(null);
    const result = await verifyOtpFn({
      data: {
        phone,
        code: toAsciiDigits(values.code),
        ...(isSignup && fullName ? { fullName } : {}),
        ...(isSignup && referredBy ? { referredBy } : {}),
      },
    });

    if (!result.ok || !result.tokenHash) {
      setFormError(result.message);
      toast.error(result.message);
      return;
    }
    const { error } = await supabase.auth.verifyOtp({
      type: "email",
      token_hash: result.tokenHash,
    });
    if (error) {
      setFormError("ایجاد نشست ناموفق بود. دوباره تلاش کنید.");
      toast.error("ایجاد نشست ناموفق بود. دوباره تلاش کنید.");
      return;
    }
    toast.success(result.message);
    void navigate({ to: destination, replace: true });
  });

  if (step === "phone") {
    return (
      <form className="space-y-5" onSubmit={submitPhone} noValidate>
        {isSignup && (
          <div className="space-y-2">
            <Label htmlFor="signup-name">نام و نام خانوادگی</Label>
            <Input
              id="signup-name"
              autoComplete="name"
              aria-invalid={!!phoneForm.formState.errors.fullName}
              aria-describedby={
                phoneForm.formState.errors.fullName ? "signup-name-error" : undefined
              }
              {...phoneForm.register("fullName")}
            />
            <FieldError
              id="signup-name-error"
              message={phoneForm.formState.errors.fullName?.message as string | undefined}
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="otp-phone">شماره موبایل</Label>

          <div className="relative">
            <Smartphone
              className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="otp-phone"
              inputMode="numeric"
              dir="ltr"
              placeholder={toPersianDigits("09121234567")}
              autoComplete="tel"
              aria-invalid={!!phoneForm.formState.errors.phone}
              aria-describedby={phoneForm.formState.errors.phone ? "otp-phone-error" : undefined}
              {...phoneForm.register("phone")}
            />
          </div>
          <FieldError id="otp-phone-error" message={phoneForm.formState.errors.phone?.message} />
          <p className="text-xs text-muted-foreground">
            کد ۶ رقمی تأیید برای همین شماره پیامک می‌شود.
          </p>
        </div>

        <div aria-live="polite">
          {formError && (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {formError}
            </p>
          )}
        </div>

        <Button
          type="submit"
          className="min-h-11 w-full"
          disabled={phoneForm.formState.isSubmitting || cooldown > 0}
        >
          {phoneForm.formState.isSubmitting && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          {cooldown > 0 ? `ارسال مجدد تا ${cooldown} ثانیه` : "دریافت کد تأیید"}
        </Button>
      </form>
    );
  }

  return (
    <form className="space-y-5" onSubmit={submitCode} noValidate>
      <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 p-3 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <ShieldCheck className="size-4" aria-hidden="true" />
          کد به{" "}
          <span dir="ltr" className="font-medium tabular-nums text-foreground">
            {toPersianDigits(toLocalMobile(phone))}
          </span>{" "}
          ارسال شد
        </span>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-xs"
          onClick={() => {
            setStep("phone");
            setFormError(null);
          }}
        >
          ویرایش شماره
        </Button>
      </div>

      {devCode && (
        <p
          className="rounded-lg bg-accent p-3 text-center text-sm font-medium text-accent-foreground"
          dir="ltr"
        >
          کد آزمایشی: {devCode}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="otp-code">کد تأیید</Label>
        <Input
          id="otp-code"
          inputMode="numeric"
          dir="ltr"
          maxLength={6}
          className="text-center text-lg tracking-[0.6em]"
          autoComplete="one-time-code"
          aria-invalid={!!codeForm.formState.errors.code}
          aria-describedby={codeForm.formState.errors.code ? "otp-code-error" : undefined}
          {...codeForm.register("code")}
        />
        <FieldError id="otp-code-error" message={codeForm.formState.errors.code?.message} />
      </div>

      <div aria-live="polite">
        {formError && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {formError}
          </p>
        )}
      </div>

      <Button type="submit" className="min-h-11 w-full" disabled={codeForm.formState.isSubmitting}>
        {codeForm.formState.isSubmitting && (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        )}
        {isSignup ? "تأیید و ساخت حساب" : "تأیید و ورود"}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        className="w-full"
        disabled={cooldown > 0}
        onClick={() => void sendCode(phone)}
      >
        {cooldown > 0 ? `ارسال مجدد کد تا ${cooldown} ثانیه` : "ارسال مجدد کد"}
      </Button>
    </form>
  );
}
