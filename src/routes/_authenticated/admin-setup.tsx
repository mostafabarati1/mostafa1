import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/data-states";
import { rpc } from "@/lib/supabase-rpc";

export const Route = createFileRoute("/_authenticated/admin-setup")({
  head: () => ({
    meta: [
      { title: "راه‌اندازی مدیریت | همراه استخدام" },
      { name: "description", content: "ثبت به عنوان مدیر نخست سامانه" },
      { property: "og:title", content: "راه‌اندازی مدیریت | همراه استخدام" },
      { property: "og:description", content: "ثبت به عنوان مدیر نخست سامانه" },
    ],
  }),
  component: AdminSetupPage,
});

function AdminSetupPage() {
  const { displayName, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const claim = async () => {
    setLoading(true);
    try {
      const claimed = await rpc<boolean>("claim_first_admin");
      if (claimed) {
        toast.success("تبریک! شما مدیر نخست سامانه شدید.");
        void navigate({ to: "/dashboard" });
      } else {
        toast.error("مدیر نخست قبلاً انتخاب شده است.");
      }
    } catch (e) {
      toast.error("خطا در ثبت مدیریت");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="راه‌اندازی مدیریت"
        description="اگر نخستین کاربر سامانه هستید، می‌توانید مدیریت را بر عهده بگیرید."
      />
      <Card className="max-w-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-6 text-primary" />
            <CardTitle>مدیر شدن</CardTitle>
          </div>
          <CardDescription>
            فقط نخستین کاربری که این گزینه را فعال کند مدیر سامانه می‌شود. پس از آن، مدیریت فقط توسط
            مدیر فعلی قابل واگذاری است.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            حساب: <span className="font-medium text-foreground">{displayName}</span>
          </p>
          {isAdmin ? (
            <p className="text-sm font-medium text-primary">شما هم‌اکنون مدیر سامانه هستید.</p>
          ) : (
            <Button onClick={() => void claim()} disabled={loading}>
              {loading ? "در حال بررسی…" : "مدیر نخست شوید"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
