import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, Copy, Gift } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/data-states";
import { ProfileNewsletterEmailCard } from "@/components/newsletter/profile-email-card";
import { humanizeError } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "پروفایل | همراه استخدام" },
      { name: "description", content: "مشاهده و ویرایش اطلاعات حساب کاربری" },
      { property: "og:title", content: "پروفایل | همراه استخدام" },
      { property: "og:description", content: "مشاهده و ویرایش اطلاعات حساب کاربری" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      // ستون referral_code افزودنی است و هنوز در تایپ‌های تولیدشده نیست.
      .select("full_name, mobile, referral_code" as unknown as "full_name, mobile")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error(error);
        setFullName(data?.full_name ?? "");
        setMobile(data?.mobile ?? "");
        setReferralCode(
          (data as { referral_code?: string | null } | null)?.referral_code?.trim() || null,
        );
        setLoading(false);
      });
  }, [user]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, mobile: mobile || null })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error(humanizeError(error));
      return;
    }
    toast.success("پروفایل به‌روزرسانی شد.");
  };

  const inviteLink =
    referralCode && typeof window !== "undefined"
      ? `${window.location.origin}/signup?ref=${referralCode}`
      : "";

  const copyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success("لینک دعوت کپی شد.");
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error("کپی لینک ممکن نشد؛ لینک را دستی انتخاب و کپی کنید.");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    void navigate({ to: "/auth", replace: true });
  };

  return (
    <div>
      <PageHeader title="پروفایل" description="مشاهده و ویرایش اطلاعات حساب کاربری" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>اطلاعات حساب</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <form onSubmit={saveProfile} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="loginPhone">شماره موبایل ورود</Label>
                  <Input id="loginPhone" dir="ltr" value={mobile || "—"} disabled />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fullName">نام و نام خانوادگی</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? "در حال ذخیره…" : "ذخیره تغییرات"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void handleSignOut()}>
                    خروج از حساب
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <ProfileNewsletterEmailCard />

        {referralCode ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="size-5 text-primary" aria-hidden="true" />
                دعوت از دوستان؛ ۷ روز اشتراک هدیه
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-7 text-muted-foreground">
                با هر دوستی که از طریق لینک دعوت شما ثبت‌نام کند، هم شما و هم او ۷ روز اشتراک هدیه
                می‌گیرید. هدیه به تاریخ انقضای فعلی اشتراک اضافه می‌شود.
              </p>
              <div className="space-y-2">
                <Label htmlFor="inviteLink">لینک دعوت شما</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="inviteLink"
                    dir="ltr"
                    readOnly
                    value={inviteLink}
                    className="flex-1 font-mono text-xs"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button type="button" variant="outline" onClick={() => void copyInviteLink()}>
                    {copied ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : (
                      <Copy className="size-4" aria-hidden="true" />
                    )}
                    {copied ? "کپی شد" : "کپی لینک"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
