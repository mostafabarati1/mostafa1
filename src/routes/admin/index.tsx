import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  CreditCard,
  Wallet,
  GraduationCap,
  FlagTriangleRight,
  Activity,
} from "lucide-react";
import { PageHeader, ErrorState, CardsLoading } from "@/components/data-states";
import { StatCard } from "@/components/admin/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { adminOverviewQuery, adminRecentAuditQuery } from "@/lib/admin/queries";
import { formatDateTime, formatNumber, formatPrice } from "@/lib/format";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "داشبورد مدیریت | همراه استخدام" },
      {
        name: "description",
        content: "نمای کلی کاربران، اشتراک‌ها، درآمد و آزمون‌های سامانه همراه استخدام.",
      },
      { property: "og:title", content: "داشبورد مدیریت | همراه استخدام" },
      {
        property: "og:description",
        content: "نمای کلی کاربران، اشتراک‌ها، درآمد و آزمون‌های سامانه همراه استخدام.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminDashboard,
});

const RANGES = [
  { value: 7, label: "۷ روز" },
  { value: 30, label: "۳۰ روز" },
  { value: 90, label: "۹۰ روز" },
];

function pct(current: number, prev: number) {
  if (!prev) return current > 0 ? 100 : null;
  return ((current - prev) / prev) * 100;
}

function MiniBars({ data, label }: { data: { value: number; key: string }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-24 items-end gap-1" role="img" aria-label={label}>
      {data.map((d) => (
        <span
          key={d.key}
          title={`${d.key}: ${formatNumber(d.value)}`}
          className="flex-1 rounded-t bg-primary/70"
          style={{ height: `${Math.max(4, (d.value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function AdminDashboard() {
  const [range, setRange] = useState(30);
  const overview = useQuery(adminOverviewQuery(range));
  const audit = useQuery(adminRecentAuditQuery(8));

  return (
    <>
      <PageHeader
        title="داشبورد مدیریت"
        description="نمای کلی وضعیت سامانه در بازه انتخابی"
        actions={
          <div className="flex gap-1 rounded-xl border bg-card p-1">
            {RANGES.map((r) => (
              <Button
                key={r.value}
                size="sm"
                variant={range === r.value ? "default" : "ghost"}
                onClick={() => setRange(r.value)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        }
      />

      {overview.error ? (
        <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
      ) : overview.isLoading || !overview.data ? (
        <CardsLoading count={8} />
      ) : (
        (() => {
          const d = overview.data;
          return (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="کل کاربران"
                  value={formatNumber(d.users.total)}
                  hint={`${formatNumber(d.users.new)} کاربر جدید`}
                  icon={<Users className="size-5" />}
                  delta={pct(d.users.new, d.users.new_prev)}
                />
                <StatCard
                  label="اشتراک فعال"
                  value={formatNumber(d.subs.active)}
                  hint={`${formatNumber(d.subs.trial)} آزمایشی`}
                  icon={<CreditCard className="size-5" />}
                />
                <StatCard
                  label="درآمد بازه"
                  value={formatPrice(d.revenue.total)}
                  hint={`${formatNumber(d.payments.paid)} پرداخت موفق`}
                  icon={<Wallet className="size-5" />}
                  delta={pct(d.revenue.total, d.revenue.total_prev)}
                />
                <StatCard
                  label="آزمون‌های منتشرشده"
                  value={formatNumber(d.exams.published)}
                  hint={`از ${formatNumber(d.exams.total)} آزمون`}
                  icon={<GraduationCap className="size-5" />}
                />
                <StatCard
                  label="کاربران فعال ۷ روز"
                  value={formatNumber(d.users.active_7d)}
                  icon={<Activity className="size-5" />}
                  delta={pct(d.users.active_7d, d.users.active_7d_prev)}
                />
                <StatCard
                  label="شرکت در آزمون امروز"
                  value={formatNumber(d.exams.attempts_today)}
                  hint={`دیروز ${formatNumber(d.exams.attempts_yesterday)}`}
                  icon={<GraduationCap className="size-5" />}
                  delta={pct(d.exams.attempts_today, d.exams.attempts_yesterday)}
                />
                <StatCard
                  label="نرخ قبولی"
                  value={`${formatNumber(d.exams.attempt_pass_rate, 1)}٪`}
                  icon={<Activity className="size-5" />}
                  delta={pct(d.exams.attempt_pass_rate, d.exams.attempt_pass_rate_prev)}
                />
                <StatCard
                  label="گزارش سوال باز"
                  value={formatNumber(d.question_reports.open)}
                  hint={`${formatNumber(d.question_reports.reviewing)} در بررسی`}
                  icon={<FlagTriangleRight className="size-5" />}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">روند درآمد</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <MiniBars
                      label="نمودار درآمد روزانه"
                      data={d.revenue.by_day.map((x) => ({ key: x.day, value: Number(x.amount) }))}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">روند شرکت در آزمون</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <MiniBars
                      label="نمودار شرکت روزانه در آزمون"
                      data={d.exams.attempts_by_day.map((x) => ({
                        key: x.day,
                        value: Number(x.count),
                      }))}
                    />
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">کاربران جدید</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {d.recent_users.length === 0 && (
                      <p className="text-sm text-muted-foreground">موردی نیست.</p>
                    )}
                    {d.recent_users.map((u) => (
                      <Link
                        key={u.id}
                        to="/admin/users/$id"
                        params={{ id: u.id }}
                        className="block rounded-lg px-2 py-1.5 transition-colors hover:bg-accent"
                      >
                        <p className="truncate text-sm font-medium">{u.full_name ?? "بی‌نام"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {u.email ?? "—"} · {formatDateTime(u.created_at)}
                        </p>
                      </Link>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">آخرین پرداخت‌ها</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {d.recent_payments.length === 0 && (
                      <p className="text-sm text-muted-foreground">موردی نیست.</p>
                    )}
                    {d.recent_payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {p.full_name ?? "کاربر حذف‌شده"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(p.created_at)}
                          </p>
                        </div>
                        <div className="shrink-0 text-end">
                          <p className="text-sm font-medium">{formatPrice(p.amount)}</p>
                          <Badge
                            variant={
                              ["paid", "verified"].includes(p.status) ? "default" : "secondary"
                            }
                          >
                            {p.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">آخرین فعالیت مدیران</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {audit.isLoading && (
                      <p className="text-sm text-muted-foreground">در حال دریافت…</p>
                    )}
                    {audit.data?.length === 0 && (
                      <p className="text-sm text-muted-foreground">فعالیتی ثبت نشده است.</p>
                    )}
                    {audit.data?.map((a) => (
                      <div key={a.id} className="text-sm">
                        <p className="truncate font-medium">
                          {a.action} · {a.entity}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {a.actor_name ?? "سیستم"} · {formatDateTime(a.created_at)}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          );
        })()
      )}
    </>
  );
}
