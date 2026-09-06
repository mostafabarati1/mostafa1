import { CreditCard, FileCheck2, Flag, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatNumber, formatPrice } from "@/lib/format";
import type { AdminUserDetail } from "@/lib/admin/queries";

export function UserSummaryCards({ detail }: { detail: AdminUserDetail }) {
  const s = detail.summary;
  const activeSub = s?.active_subscription ?? null;

  const items = [
    {
      icon: FileCheck2,
      label: "تلاش‌ها",
      value: formatNumber(s?.attempts_count ?? detail.attempts.length),
      hint: "مجموع شرکت در آزمون‌ها",
    },
    {
      icon: CreditCard,
      label: "پرداخت‌ها",
      value: formatNumber(s?.payments_count ?? detail.payments.length),
      hint: `مبلغ موفق: ${formatPrice(s?.paid_total ?? 0)}`,
    },
    {
      icon: Flag,
      label: "گزارش‌ها",
      value: formatNumber(s?.reports_count ?? detail.reports.length),
      hint: "گزارش‌های ثبت‌شده روی سوال‌ها",
    },
    {
      icon: ShieldAlert,
      label: "اشتراک فعال",
      value: activeSub ? (activeSub.plan_title ?? "فعال") : "ندارد",
      hint: activeSub ? `تا ${formatDate(activeSub.expires_at)}` : "اشتراک فعالی ثبت نشده است",
    },
  ];

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <Card key={it.label}>
          <CardContent className="flex items-start gap-3 pt-6">
            <span className="rounded-xl bg-muted p-2 text-muted-foreground">
              <it.icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{it.label}</p>
              <p className="truncate text-lg font-semibold text-foreground">{it.value}</p>
              <p className="truncate text-xs text-muted-foreground">{it.hint}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
