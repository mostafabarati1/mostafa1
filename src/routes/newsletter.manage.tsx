import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { NewsletterAccountPreferences } from "@/components/newsletter/account-preferences";
import {
  NewsletterError,
  NewsletterLoading,
  NewsletterPage,
} from "@/components/newsletter/newsletter-ui";
import {
  getSubscriptionByToken,
  updatePreferencesByToken,
  unsubscribeByToken,
} from "@/lib/newsletter-db";

type Search = { token?: string | undefined };

export const Route = createFileRoute("/newsletter/manage")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    token: typeof search["token"] === "string" ? search["token"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "مدیریت اشتراک خبرنامه | همراه استخدام" },
      {
        name: "description",
        content:
          "نوع اعلان‌های خبرنامه همراه استخدام و دوره ارسال ایمیل‌ها را تنظیم کنید یا عضویت خود را لغو کنید.",
      },
      { property: "og:title", content: "مدیریت اشتراک خبرنامه همراه استخدام" },
      {
        property: "og:description",
        content: "تنظیم اعلان‌های آزمون، مهلت ثبت‌نام، کارت ورود و نتایج.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ManagePage,
});

const toggles = [
  { key: "newsletter", label: "خبرنامه دوره‌ای" },
  { key: "exam_alerts", label: "آگهی آزمون جدید" },
  { key: "deadline_alerts", label: "یادآور مهلت ثبت‌نام" },
  { key: "exam_card_alerts", label: "انتشار کارت ورود به جلسه" },
  { key: "results_alerts", label: "اعلام نتایج" },
  { key: "news_alerts", label: "اخبار و اطلاعیه‌ها" },
  { key: "organization_alerts", label: "به‌روزرسانی دستگاه‌های دنبال‌شده" },
  { key: "channel_email", label: "دریافت از طریق ایمیل" },
] as const;

const frequencies = [
  { value: "instant", label: "فوری" },
  { value: "daily", label: "روزانه" },
  { value: "weekly", label: "هفتگی" },
];

function ManagePage() {
  const { token } = Route.useSearch();
  const { session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [manualToken, setManualToken] = useState("");
  const [prefs, setPrefs] = useState<Record<string, boolean | string>>({});

  const query = useQuery({
    queryKey: ["newsletter", "subscription", token],
    queryFn: () => getSubscriptionByToken(token!),
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (query.data?.preferences) {
      setPrefs(query.data.preferences as Record<string, boolean | string>);
    }
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => updatePreferencesByToken(token!, prefs),
    onSuccess: () => {
      toast.success("تنظیمات ذخیره شد.");
      void queryClient.invalidateQueries({ queryKey: ["newsletter", "subscription", token] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: () => unsubscribeByToken(token!),
    onSuccess: () => {
      toast.success("عضویت شما لغو شد.");
      void queryClient.invalidateQueries({ queryKey: ["newsletter", "subscription", token] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // کاربر واردشده: تنظیمات متصل به حساب (مسیر اصلی)
  if (!token && session) {
    return (
      <NewsletterPage title="مدیریت اشتراک">
        <NewsletterAccountPreferences />
      </NewsletterPage>
    );
  }

  if (!token) {
    return (
      <NewsletterPage title="مدیریت اشتراک">
        <p className="text-sm text-muted-foreground">
          برای مدیریت اشتراک، لینک اختصاصی موجود در انتهای ایمیل‌های خبرنامه را باز کنید یا کد
          اشتراک خود را وارد کنید.
        </p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const value = manualToken.trim();
            if (value) void navigate({ to: "/newsletter/manage", search: { token: value } });
          }}
        >
          <Input
            dir="ltr"
            className="text-left"
            placeholder="کد اشتراک (token)"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            aria-label="کد اشتراک"
          />
          <Button type="submit">مشاهده</Button>
        </form>
      </NewsletterPage>
    );
  }

  if (query.isPending) {
    return (
      <NewsletterPage title="مدیریت اشتراک">
        <NewsletterLoading />
      </NewsletterPage>
    );
  }

  if (query.error) {
    return (
      <NewsletterPage title="مدیریت اشتراک">
        <NewsletterError error={query.error} onRetry={() => void query.refetch()} />
      </NewsletterPage>
    );
  }

  if (!query.data) {
    return (
      <NewsletterPage title="مدیریت اشتراک">
        <p className="text-sm text-muted-foreground">اشتراکی با این کد پیدا نشد.</p>
      </NewsletterPage>
    );
  }

  const { email, status } = query.data;

  return (
    <NewsletterPage title="مدیریت اشتراک">
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          ایمیل:{" "}
          <span dir="ltr" className="font-medium text-foreground">
            {email}
          </span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          وضعیت:{" "}
          <span className="font-medium text-foreground">
            {status === "active"
              ? "فعال"
              : status === "pending"
                ? "در انتظار تأیید"
                : status === "unsubscribed"
                  ? "لغو شده"
                  : "برگشت‌خورده"}
          </span>
        </p>
      </div>

      <div className="mt-5 grid gap-3 rounded-xl border border-border bg-card p-5">
        {toggles.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <Label htmlFor={key} className="text-sm">
              {label}
            </Label>
            <Switch
              id={key}
              checked={Boolean(prefs[key] ?? true)}
              onCheckedChange={(v) => setPrefs((p) => ({ ...p, [key]: v }))}
            />
          </div>
        ))}

        <div className="mt-2">
          <p className="mb-2 text-sm">دوره ارسال ایمیل</p>
          <div className="flex flex-wrap gap-2">
            {frequencies.map((f) => (
              <Button
                key={f.value}
                type="button"
                size="sm"
                variant={
                  (prefs["digest_frequency"] ?? "instant") === f.value ? "default" : "outline"
                }
                onClick={() => setPrefs((p) => ({ ...p, digest_frequency: f.value }))}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "در حال ذخیره…" : "ذخیره تنظیمات"}
        </Button>
        <Button
          variant="outline"
          onClick={() => cancel.mutate()}
          disabled={cancel.isPending || status === "unsubscribed"}
        >
          لغو عضویت
        </Button>
      </div>
    </NewsletterPage>
  );
}
