import { Link } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/admin/data-table";
import { formatDateTime } from "@/lib/format";
import type { AdminUserDetail } from "@/lib/admin/queries";
import { ReportStatusBadge } from "@/components/admin/user-detail/status-badges";

type Report = AdminUserDetail["reports"][number];

export function UserReportsTab({ detail }: { detail: AdminUserDetail }) {
  const columns: Column<Report>[] = [
    { key: "reason", header: "نوع گزارش", cell: (r) => r.reason },
    {
      key: "description",
      header: "موضوع",
      cell: (r) => (
        <span className="line-clamp-2 max-w-xs text-xs text-muted-foreground">
          {r.description ?? "—"}
        </span>
      ),
    },
    { key: "status", header: "وضعیت رسیدگی", cell: (r) => <ReportStatusBadge status={r.status} /> },
    { key: "created", header: "زمان ثبت", cell: (r) => formatDateTime(r.created_at) },
    { key: "updated", header: "آخرین اقدام", cell: (r) => formatDateTime(r.updated_at) },
    {
      key: "actions",
      header: "",
      cell: () => (
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/reports-questions">
            <Eye className="size-4" />
            بررسی
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={detail.reports}
      rowKey={(r) => r.id}
      emptyTitle="گزارشی ثبت نشده است"
      emptyDescription="این کاربر گزارشی روی سوال‌ها ثبت نکرده است."
    />
  );
}
