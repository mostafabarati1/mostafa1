import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { humanizeError } from "@/lib/format";
import {
  getMyNewsletterStatus,
  setMyNewsletterEmail,
  updateMyNewsletterPreferences,
} from "@/lib/newsletter/preferences.functions";

const PLACEHOLDER_DOMAIN = "@phone.hamrah-estekhdam.local";

/** ثبت ایمیل واقعی کاربر در پروفایل برای دریافت اخبار و خبرنامه. */
export function ProfileNewsletterEmailCard() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getMyNewsletterStatus);
  const saveEmail = useServerFn(setMyNewsletterEmail);
  const savePrefs = useServerFn(updateMyNewsletterPreferences);

  const [email, setEmail] = useState("");
  const [wantsEmail, setWantsEmail] = useState(false);

  const query = useQuery({
    queryKey: ["newsletter", "my-status"],
    queryFn: () => fetchStatus(),
  });

  useEffect(() => {
    const status = query.data;
    if (!status) return;
    const current = status.email ?? "";
    setEmail(current.endsWith(PLACEHOLDER_DOMAIN) ? "" : current);
    setWantsEmail(Boolean(status.preferences?.channel_email));
  }, [query.data]);

  const save = useMutation({
    mutationFn: async () => {
      await saveEmail({ data: { email: email.trim() } });
      await savePrefs({
        data: wantsEmail
          ? { channel_email: true, newsletter: true, news_alerts: true }
          : { channel_email: false },
      });
    },
    onSuccess: () => {
      toast.success("ایمیل شما ذخیره شد.");
      void qc.invalidateQueries({ queryKey: ["newsletter", "my-status"] });
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>ایمیل خبرنامه</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.trim()) {
                toast.error("ایمیل خود را وارد کنید.");
                return;
              }
              save.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="newsletterEmail">ایمیل</Label>
              <Input
                id="newsletterEmail"
                type="email"
                dir="ltr"
                className="text-left"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="wantsEmail" className="text-sm">
                دریافت اخبار و خبرنامه با ایمیل
              </Label>
              <Switch id="wantsEmail" checked={wantsEmail} onCheckedChange={setWantsEmail} />
            </div>

            <p className="text-sm leading-7 text-muted-foreground">
              ورود شما به حساب تنها با شماره موبایل و کد پیامکی انجام می‌شود؛ ایمیل فقط برای ارسال
              اخبار استخدامی و خبرنامه استفاده می‌شود.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "در حال ذخیره…" : "ذخیره ایمیل"}
              </Button>
              <Link
                to="/newsletter/manage"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                تنظیمات کامل خبرنامه
              </Link>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
