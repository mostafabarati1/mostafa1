import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";

/** Lightweight, self-contained SVG illustration of a scored answer sheet. */
function AuthIllustration() {
  return (
    <svg
      viewBox="0 0 320 220"
      className="h-auto w-full max-w-md"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="16" y="14" width="196" height="192" rx="14" fill="var(--color-card)" opacity=".96" />
      <rect x="36" y="36" width="120" height="10" rx="5" fill="var(--color-muted)" />
      <rect x="36" y="58" width="86" height="8" rx="4" fill="var(--color-muted)" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(36 ${86 + i * 28})`}>
          <circle cx="8" cy="8" r="8" fill="none" stroke="var(--color-border)" strokeWidth="2" />
          <rect
            x="26"
            y="3"
            width={110 - i * 16}
            height="10"
            rx="5"
            fill="var(--color-secondary)"
          />
        </g>
      ))}
      <circle cx="44" cy="94" r="8" fill="var(--color-brand)" />
      <circle cx="44" cy="150" r="8" fill="var(--color-brand)" />
      <rect
        x="150"
        y="120"
        width="154"
        height="86"
        rx="14"
        fill="var(--color-primary)"
        opacity=".95"
      />
      <g transform="translate(168 138)">
        <rect y="34" width="18" height="30" rx="4" fill="var(--color-brand)" />
        <rect x="26" y="20" width="18" height="44" rx="4" fill="var(--color-brand)" opacity=".85" />
        <rect x="52" y="8" width="18" height="56" rx="4" fill="var(--color-brand)" opacity=".7" />
        <rect x="78" width="18" height="64" rx="4" fill="var(--color-brand)" opacity=".55" />
      </g>
    </svg>
  );
}

const BENEFITS = [
  "آزمون‌های استاندارد و زمان‌دار مشابه شرایط واقعی",
  "کارنامه تحلیلی و شناسایی نقاط ضعف درسی",
  "مرور پاسخ‌ها همراه با پاسخ تشریحی",
];

export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-muted/40" dir="rtl">
      <div className="absolute end-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <div className="mx-auto grid min-h-dvh max-w-6xl grid-cols-1 lg:grid-cols-[45%_55%]">
        <main className="flex items-center justify-center px-4 py-10 sm:px-6">
          <div className="w-full max-w-md">
            <Link
              to="/"
              className="mb-6 inline-flex rounded-lg lg:hidden"
              aria-label="همراه استخدام — صفحه اصلی"
            >
              <BrandLogo />
            </Link>
            <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
              <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
              {description && (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              )}
              <div className="mt-6">{children}</div>
            </div>
          </div>
        </main>

        <aside className="hidden flex-col justify-center gap-8 border-s bg-background px-10 py-12 lg:flex">
          <Link
            to="/"
            className="inline-flex w-fit rounded-lg"
            aria-label="همراه استخدام — صفحه اصلی"
          >
            <BrandLogo size={40} />
          </Link>
          <div>
            <h2 className="text-2xl font-extrabold leading-relaxed text-foreground">
              هدفمند تمرین کنید، با آمادگی وارد جلسه آزمون شوید
            </h2>
            <ul className="mt-6 space-y-3">
              {BENEFITS.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-3 text-sm leading-7 text-muted-foreground"
                >
                  <span className="mt-2 size-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <AuthIllustration />
        </aside>
      </div>
    </div>
  );
}
