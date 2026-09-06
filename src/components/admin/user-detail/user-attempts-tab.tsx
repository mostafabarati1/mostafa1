import { Link } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/admin/data-table";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";
import type { AdminUserDetail } from "@/lib/admin/queries";
import { AttemptStatusBadge } from "@/components/admin/user-detail/status-badges";

type Attempt = AdminUserDetail["attempts"][number];

export function UserAttemptsTab({ detail }: { detail: AdminUserDetail }) {
  const columns: Column<Attempt>[] = [
    { key: "exam", header: "آزمون", cell: (a) => a.exam_title ?? "آزمون حذف‌شده" },
    {
      key: "status",
      header: "وضعیت",
      cell: (a) => <AttemptStatusBadge status={a.status} passed={a.passed} />,
    },
    {
      key: "score",
      header: "نمره",
      cell: (a) => `${formatNumber(a.earned_score ?? 0)} از ${formatNumber(a.total_score ?? 0)}`,
    },
    { key: "started", header: "شروع", cell: (a) => formatDateTime(a.started_at) },
    { key: "submitted", header: "پایان", cell: (a) => formatDateTime(a.submitted_at) },
    {
      key: "duration",
      header: "مدت",
      cell: (a) => (a.duration_seconds ? formatDuration(a.duration_seconds) : "—"),
    },
    {
      key: "actions",
      header: "",
      cell: (a) => (
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/exams/$id" params={{ id: a.exam_id }}>
            <Eye className="size-4" />
            آزمون
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={detail.attempts}
      rowKey={(a) => a.id}
      emptyTitle="تلاشی ثبت نشده است"
      emptyDescription="این کاربر هنوز در هیچ آزمونی شرکت نکرده است."
    />
  );
}
