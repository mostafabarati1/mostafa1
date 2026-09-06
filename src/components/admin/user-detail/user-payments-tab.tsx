import { Link } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/admin/data-table";
import { formatDateTime, formatPrice } from "@/lib/format";
import type { AdminUserDetail } from "@/lib/admin/queries";
import { PaymentStatusBadge } from "@/components/admin/user-detail/status-badges";
import { maskRef } from "@/lib/admin/user-detail-utils";

type Payment = AdminUserDetail["payments"][number];

export function UserPaymentsTab({ detail }: { detail: AdminUserDetail }) {
  const columns: Column<Payment>[] = [
    {
      key: "amount",
      header: "مبلغ",
      cell: (p) => formatPrice(p.amount, p.currency === "IRR" ? "ریال" : "تومان"),
    },
    { key: "plan", header: "پلن", cell: (p) => p.plan_title ?? "—" },
    { key: "gateway", header: "درگاه", cell: (p) => p.gateway ?? "—" },
    {
      key: "ref",
      header: "شناسه تراکنش",
      cell: (p) => (
        <span dir="ltr" className="font-mono text-xs">
          {maskRef(p.ref_id)}
        </span>
      ),
    },
    { key: "status", header: "وضعیت", cell: (p) => <PaymentStatusBadge status={p.status} /> },
    { key: "created", header: "ثبت", cell: (p) => formatDateTime(p.created_at) },
    { key: "paid", header: "تأیید", cell: (p) => formatDateTime(p.paid_at ?? p.verified_at) },
  ];

  return (
    <div className="space-y-3">
      <DataTable
        columns={columns}
        rows={detail.payments}
        rowKey={(p) => p.id}
        emptyTitle="پرداختی ثبت نشده است"
        emptyDescription="برای این کاربر تراکنشی ثبت نشده است."
      />
      {detail.payments.length > 0 && (
        <div className="flex justify-end">
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/payments">
              <Receipt className="size-4" />
              مشاهده در فهرست پرداخت‌ها
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
