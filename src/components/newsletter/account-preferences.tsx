import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NewsletterError, NewsletterLoading } from "@/components/newsletter/newsletter-ui";
import { humanizeError } from "@/lib/format";
import {
  getMyNewsletterStatus,
  updateMyNewsletterPreferences,
  type NewsletterChannelPreferences,
} from "@/lib/newsletter/preferences.functions";

/**
 * مدیریت اشتراک خبرنامه بر پایه حساب کاربری (مسیر اصلی برای کاربر واردشده).
 * جریان توکن ایمیل تنها به‌عنوان جایگزین (fallback) باقی می‌ماند.
 */

const TOGGLES: { key: keyof NewsletterChannelPreferences; label: string }[] = [
  { key: "newsletter", label: "خبرنامه دوره‌ای" },
  { key: "exam_alerts", label: "آگهی آزمون جدید" },
  { key: "deadline_alerts", label: "یادآور مهلت ثبت‌نام" },
  { key: "exam_card_alerts", label: "انتشار کارت ورود به جلسه" },
  { key: "results_alerts", label: "اعلام نتایج" },
  { key: "news_alerts", label: "اخبار و اطلاعیه‌ها" },
  { key: "organization_alerts", label: "به‌روزرسانی دستگاه‌های دنبال‌شده" },
  { key: "channel_email", label: "دریافت از طریق ایمیل" },
  { key: "channel_in_app", label: "دریافت در پنل کاربری" },
  { key: "channel_sms", label: "دریافت پیامک (نیازمند موبایل تأییدشده)" },
];

const FREQUENCIES: { value: "instant" | "daily" | "weekly"; label: string }[] = [
  { value: "instant", label: "فوری" },
  { value: "daily", label: "روزانه" },
  { value: "weekly", label: "هفتگی" },
];

export function NewsletterAccountPreferences() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getMyNewsletterStatus);
  const savePrefs = useServerFn(updateMyNewsletterPreferences);
  const [prefs, setPrefs] = useState<Partial<NewsletterChannelPreferences>>({});

  const query = useQuery({
    queryKey: ["newsletter", "my-status"],
    queryFn: () => fetchStatus(),
  });

  useEffect(() => {
    if (query.data?.preferences) setPrefs(query.data.preferences);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => savePrefs({ data: prefs }),
    onSuccess: () => {
      toast.success("تنظیمات ذخیره شد.");
      void qc.invalidateQueries({ queryKey: ["newsletter", "my-status"] });
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  if (query.isPending) return <NewsletterLoading />;
  if (query.error)
    return <NewsletterError error={query.error} onRetry={() => void query.refetch()} />;

  const status = query.data;

  return (
    <div dir="rtl">
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          ایمیل حساب:{" "}
          <span dir="ltr" className="font-medium text-foreground">
            {status?.email ?? "—"}
          </span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          وضعیت اشتراک:{" "}
          <span className="font-medium text-foreground">
            {status?.subscriber_status === "active"
              ? "فعال"
              : status?.subscriber_status === "pending"
                ? "در انتظار تأیید"
                : status?.subscriber_status === "unsubscribed"
                  ? "لغو شده"
                  : status?.subscriber_status === "bounced"
                    ? "برگشت‌خورده"
                    : "ثبت نشده"}
          </span>
        </p>
      </div>

      <div className="mt-5 grid gap-3 rounded-xl border border-border bg-card p-5">
        {TOGGLES.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <Label htmlFor={`acc-${key}`} className="text-sm">
              {label}
            </Label>
            <Switch
              id={`acc-${key}`}
              checked={Boolean(prefs[key] ?? false)}
              onCheckedChange={(v) => setPrefs((p) => ({ ...p, [key]: v }))}
            />
          </div>
        ))}

        <div className="mt-2">
          <p className="mb-2 text-sm">دوره ارسال ایمیل</p>
          <div className="flex flex-wrap gap-2">
            {FREQUENCIES.map((f) => (
              <Button
                key={f.value}
                type="button"
                size="sm"
                variant={(prefs.digest_frequency ?? "instant") === f.value ? "default" : "outline"}
                onClick={() => setPrefs((p) => ({ ...p, digest_frequency: f.value }))}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "در حال ذخیره…" : "ذخیره تنظیمات"}
        </Button>
      </div>
    </div>
  );
}
