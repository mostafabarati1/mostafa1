import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/format";
import type { AdminUserDetail } from "@/lib/admin/queries";
import { AccountStatusBadge, RoleBadge } from "@/components/admin/user-detail/status-badges";

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function UserProfileTab({
  detail,
  actions,
}: {
  detail: AdminUserDetail;
  actions?: ReactNode;
}) {
  const p = detail.profile;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">اطلاعات پایه</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Row label="نام نمایشی" value={p.full_name?.trim() || "—"} />
          <Row label="ایمیل" value={p.email ?? "—"} />
          <Row label="شماره تماس" value={p.mobile ?? "—"} />
          <Row label="نقش" value={<RoleBadge role={p.role} />} />
          <Row label="وضعیت حساب" value={<AccountStatusBadge status={p.status} />} />
          <Row label="تاریخ عضویت" value={formatDateTime(p.created_at)} />
          <Row label="آخرین ویرایش" value={formatDateTime(p.updated_at)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">وضعیت دوره آزمایشی</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Row label="استفاده از دوره آزمایشی" value={p.has_used_trial ? "بله" : "خیر"} />
          <Row label="شروع دوره آزمایشی" value={formatDate(p.trial_started_at)} />
          <Row label="پایان دوره آزمایشی" value={formatDate(p.trial_ends_at)} />
          <Row
            label="شناسه کاربر"
            value={
              <span dir="ltr" className="font-mono text-xs">
                {p.id}
              </span>
            }
          />
        </CardContent>
      </Card>

      {actions && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">عملیات حساب</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-0">{actions}</CardContent>
        </Card>
      )}
    </div>
  );
}
