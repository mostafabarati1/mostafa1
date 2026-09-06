import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Users, CheckCircle2, XCircle, Wallet, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, PageHeader } from "@/components/data-states";
import { formatNumber, formatPrice, humanizeError } from "@/lib/format";
import { rpc } from "@/lib/supabase-rpc";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({
    meta: [
      { title: "گزارش‌ها | همراه استخدام" },
      { name: "description", content: "گزارش‌های مالی و اشتراک سامانه" },
    ],
  }),
  component: ReportsPage,
});

type PayStats = {
  total_count: number;
  paid_count: number;
  failed_count: number;
  pending_count: number;
  revenue: number;
};
type SubStats = {
  total: number;
  active: number;
  trial: number;
  expired: number;
  cancelled: number;
};

function ReportsPage() {
  const payQ = useQuery({
    queryKey: ["admin-pay-stats"],
    queryFn: () => rpc<PayStats>("admin_payment_stats"),
  });
  const subQ = useQuery({
    queryKey: ["admin-sub-stats"],
    queryFn: () => rpc<SubStats>("admin_subscription_stats"),
  });

  if (payQ.isError || subQ.isError) {
    return (
      <div>
        <PageHeader title="گزارش‌ها" description="گزارش‌های مالی و اشتراک سامانه" />
        <ErrorState
          error={payQ.error ?? subQ.error}
          onRetry={() => {
            void payQ.refetch();
            void subQ.refetch();
          }}
        />
      </div>
    );
  }

  const p = payQ.data;
  const s = subQ.data;

  return (
    <div>
      <PageHeader title="گزارش‌ها" description="نمای کلی از وضعیت مالی و اشتراک‌ها" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<CreditCard className="size-5 text-primary" />}
          title="کل پرداخت‌ها"
          value={p ? formatNumber(p.total_count) : undefined}
        />
        <StatCard
          icon={<CheckCircle2 className="size-5 text-emerald-500" />}
          title="پرداخت موفق"
          value={p ? formatNumber(p.paid_count) : undefined}
        />
        <StatCard
          icon={<XCircle className="size-5 text-destructive" />}
          title="پرداخت ناموفق"
          value={p ? formatNumber(p.failed_count) : undefined}
        />
        <StatCard
          icon={<Clock className="size-5 text-amber-500" />}
          title="در انتظار"
          value={p ? formatNumber(p.pending_count) : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">درآمد کل</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <Wallet className="size-6 text-primary" />
              {p ? formatPrice(p.revenue) : <Skeleton className="h-6 w-24" />}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-primary" />
              اشتراک‌ها
            </CardTitle>
          </CardHeader>
          <CardContent>
            {s ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                  <span className="text-muted-foreground">کل</span>
                  <span className="font-bold">{formatNumber(s.total)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
                  <span className="text-muted-foreground">فعال</span>
                  <span className="font-bold text-emerald-600">{formatNumber(s.active)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2">
                  <span className="text-muted-foreground">آزمایشی</span>
                  <span className="font-bold text-amber-600">{formatNumber(s.trial)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                  <span className="text-muted-foreground">منقضی</span>
                  <span className="font-bold">{formatNumber(s.expired)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 col-span-2">
                  <span className="text-muted-foreground">لغو شده</span>
                  <span className="font-bold">{formatNumber(s.cancelled)}</span>
                </div>
              </div>
            ) : (
              <Skeleton className="h-20 w-full" />
            )}
          </CardContent>
        </Card>
      </div>

      {(payQ.isError || subQ.isError) && humanizeError(payQ.error ?? subQ.error) && (
        <p className="mt-2 text-sm text-destructive">{humanizeError(payQ.error ?? subQ.error)}</p>
      )}
    </div>
  );
}

function StatCard({
  icon,
  title,
  value,
}: {
  icon: React.ReactNode;
  title: string;
  value: string | number | undefined;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{title}</span>
          {icon}
        </div>
        <div className="mt-2 text-2xl font-bold">
          {value !== undefined ? value : <Skeleton className="h-7 w-16" />}
        </div>
      </CardContent>
    </Card>
  );
}
