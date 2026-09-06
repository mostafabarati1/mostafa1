import { useEffect } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { AuthLayout } from "@/components/auth-layout";
import { PhoneOtpForm } from "@/components/phone-auth/phone-otp-form";
import { useAuth } from "@/hooks/use-auth";

function safeInternalPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    returnTo?: string | undefined;
    tab?: "signup" | undefined;
    intent?: "trial" | undefined;
  } => ({
    returnTo: safeInternalPath(s["returnTo"]),
    tab: s["tab"] === "signup" ? "signup" : undefined,
    intent: s["intent"] === "trial" ? "trial" : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.tab === "signup") {
      throw redirect({
        to: "/signup",
        search: {
          ...(search.returnTo ? { returnTo: search.returnTo } : {}),
          ...(search.intent ? { intent: search.intent } : {}),
        },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "ورود با شماره موبایل | همراه استخدام" },
      {
        name: "description",
        content:
          "ورود به حساب همراه استخدام فقط با شماره موبایل و کد یک‌بارمصرف پیامکی؛ بدون رمز عبور.",
      },
      { property: "og:title", content: "ورود با شماره موبایل | همراه استخدام" },
      {
        property: "og:description",
        content: "ورود یک‌مرحله‌ای با شماره موبایل و کد تأیید پیامکی.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { returnTo } = Route.useSearch();
  const destination = returnTo ?? "/dashboard";

  useEffect(() => {
    if (!loading && session) {
      void navigate({ to: destination, replace: true });
    }
  }, [loading, session, destination, navigate]);

  if (loading || session) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center bg-muted/40 text-muted-foreground"
        dir="rtl"
        aria-live="polite"
      >
        <Loader2 className="me-2 size-5 animate-spin" aria-hidden="true" />
        در حال بررسی وضعیت حساب…
      </div>
    );
  }

  return (
    <AuthLayout
      title="ورود با شماره موبایل"
      description="شماره موبایل خود را وارد کنید تا کد یک‌بارمصرف برایتان پیامک شود."
    >
      <PhoneOtpForm mode="signin" destination={destination} />
      <p className="mt-6 text-center text-xs leading-6 text-muted-foreground">
        حساب ندارید؟{" "}
        <Link
          to="/signup"
          {...(returnTo ? { search: { returnTo } } : {})}
          className="font-medium text-primary hover:underline"
        >
          ثبت‌نام رایگان
        </Link>
      </p>
    </AuthLayout>
  );
}
