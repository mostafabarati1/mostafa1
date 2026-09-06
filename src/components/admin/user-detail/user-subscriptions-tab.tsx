import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EmptyState } from "@/components/data-states";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import type { AdminUserDetail } from "@/lib/admin/queries";
import { SubscriptionStatusBadge } from "@/components/admin/user-detail/status-badges";

type Sub = AdminUserDetail["subscriptions"][number];

export function UserSubscriptionsTab({
  detail,
  actions,
}: {
  detail: AdminUserDetail;
  actions?: ReactNode;
}) {
  const activeSub = detail.summary?.active_subscription ?? null;

  const columns: Column<Sub>[] = [
    { key: "plan", header: "پلن", cell: (s) => s.plan_title ?? "بدون پلن" },
    { key: "status", header: "وضعیت", cell: (s) => <SubscriptionStatusBadge status={s.status} /> },
    { key: "start", header: "شروع", cell: (s) => formatDate(s.started_at) },
    { key: "end", header: "پایان", cell: (s) => formatDate(s.expires_at) },
    { key: "created", header: "ثبت", cell: (s) => formatDateTime(s.created_at) },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">اشتراک فعال</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {activeSub ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">{activeSub.plan_title ?? "بدون پلن"}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(activeSub.started_at)} تا {formatDate(activeSub.expires_at)}
                </p>
              </div>
              <SubscriptionStatusBadge status={activeSub.status} />
            </div>
          ) : (
            <EmptyState
              title="اشتراک فعالی وجود ندارد"
              description="می‌توانید با تمدید، اشتراک جدیدی برای این کاربر فعال کنید."
            />
          )}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">تاریخچه اشتراک‌ها</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <DataTable
            columns={columns}
            rows={detail.subscriptions}
            rowKey={(s) => s.id}
            emptyTitle="اشتراکی ثبت نشده است"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">اعطاهای مدیریتی</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {detail.grants.length === 0 && <EmptyState title="اعطای مدیریتی ثبت نشده است" />}
          {detail.grants.map((g) => (
            <div key={g.id} className="rounded-xl border p-3 text-sm">
              <p className="font-medium">
                {formatNumber(g.days)} روز · {g.admin_name ?? "مدیر"}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(g.created_at)} · اعتبار تا {formatDate(g.expires_at)}
              </p>
              {g.reason && <p className="text-xs text-muted-foreground">دلیل: {g.reason}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
