import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emailPattern, subscribeEmail } from "@/lib/newsletter-db";

/**
 * فرم عضویت در خبرنامه.
 * این کامپوننت را هرجای پروژه اصلی (لندینگ، فوتر، صفحه آزمون) قرار دهید:
 *   <NewsletterSignup source="landing" />
 */
export function NewsletterSignup({
  source = "site",
  title = "عضویت در خبرنامه استخدامی",
  description = "از انتشار آگهی، مهلت ثبت‌نام، کارت ورود به جلسه و اعلام نتایج زودتر باخبر شوید.",
  className = "",
}: {
  source?: string;
  title?: string;
  description?: string;
  className?: string;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  /** فیلد تله اسپم — کاربر واقعی هرگز آن را پر نمی‌کند. */
  const [honeypot, setHoneypot] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const subscribe = useMutation({
    mutationFn: async () => {
      // ربات‌ها: پاسخ خنثی، بدون ثبت واقعی
      if (honeypot.trim()) return { alreadySubscribed: false as const, skipped: true as const };
      const clean = email.trim().toLowerCase();
      if (!emailPattern.test(clean)) throw new Error("ایمیل وارد‌شده معتبر نیست.");
      return { ...(await subscribeEmail(clean, source, name)), skipped: false as const };
    },
    onSuccess: (result) => {
      setEmail("");
      setName("");
      const text = result.alreadySubscribed
        ? "این ایمیل قبلاً ثبت شده است."
        : "ثبت‌نام با موفقیت انجام شد";
      setMessage({ kind: result.alreadySubscribed ? "error" : "success", text });
      if (result.alreadySubscribed) toast.error(text);
      else toast.success(text);
    },
    onError: (e: Error) => {
      const text = e.message || "ثبت‌نام انجام نشد. کمی بعد دوباره تلاش کنید.";
      setMessage({ kind: "error", text });
      toast.error(text);
    },
  });

  return (
    <section
      className={`rounded-2xl border border-border bg-card p-6 ${className}`}
      dir="rtl"
      aria-labelledby="newsletter-signup-title"
    >
      <div className="mb-3 flex items-center gap-2">
        <Mail className="size-5 text-primary" aria-hidden="true" />
        <h2 id="newsletter-signup-title" className="text-base font-semibold text-card-foreground">
          {title}
        </h2>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{description}</p>

      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          subscribe.mutate();
        }}
      >
        {/* honeypot — از دید کاربر پنهان است */}
        <div className="nls-honeypot hidden" aria-hidden="true">
          <label htmlFor="newsletter-company">شرکت</label>
          <input
            id="newsletter-company"
            name="company"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        <div className="flex-1">
          <Label htmlFor="newsletter-name" className="sr-only">
            نام (اختیاری)
          </Label>
          <Input
            id="newsletter-name"
            name="name"
            placeholder="نام (اختیاری)"
            aria-label="نام"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="flex-1">
          <Label htmlFor="newsletter-email" className="sr-only">
            ایمیل
          </Label>
          <Input
            id="newsletter-email"
            name="email"
            type="email"
            dir="ltr"
            className="text-left"
            placeholder="you@example.com"
            aria-label="ایمیل"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <Button type="submit" disabled={subscribe.isPending}>
          {subscribe.isPending ? "در حال ثبت…" : "عضویت"}
        </Button>
      </form>

      <p
        aria-live="polite"
        role="status"
        className={`mt-3 min-h-5 text-sm ${
          message?.kind === "error" ? "text-destructive" : "text-primary"
        }`}
      >
        {message?.text ?? ""}
      </p>
    </section>
  );
}
