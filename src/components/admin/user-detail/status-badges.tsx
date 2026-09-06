import { Badge } from "@/components/ui/badge";
import {
  ACCOUNT_STATUS_LABEL,
  ATTEMPT_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  REPORT_STATUS_LABEL,
  SUBSCRIPTION_STATUS_LABEL,
  labelOf,
} from "@/lib/admin/user-detail-utils";

export function RoleBadge({ role }: { role: "admin" | "candidate" | null }) {
  return (
    <Badge variant={role === "admin" ? "default" : "secondary"}>
      {role === "admin" ? "مدیر" : "کاربر"}
    </Badge>
  );
}

export function AccountStatusBadge({ status }: { status: string | null }) {
  return (
    <Badge variant={status === "active" ? "secondary" : "destructive"}>
      {labelOf(ACCOUNT_STATUS_LABEL, status)}
    </Badge>
  );
}

export function SubscriptionStatusBadge({ status }: { status: string | null }) {
  const positive = status === "active" || status === "trial";
  return (
    <Badge variant={positive ? "default" : "secondary"}>
      {labelOf(SUBSCRIPTION_STATUS_LABEL, status)}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: string | null }) {
  const paid = status === "paid" || status === "verified";
  const failed = status === "failed" || status === "cancelled";
  return (
    <Badge variant={paid ? "default" : failed ? "destructive" : "secondary"}>
      {labelOf(PAYMENT_STATUS_LABEL, status)}
    </Badge>
  );
}

export function AttemptStatusBadge({
  status,
  passed,
}: {
  status: string | null;
  passed: boolean | null;
}) {
  if (status === "submitted") {
    return <Badge variant={passed ? "default" : "destructive"}>{passed ? "قبول" : "رد"}</Badge>;
  }
  return <Badge variant="secondary">{labelOf(ATTEMPT_STATUS_LABEL, status)}</Badge>;
}

export function ReportStatusBadge({ status }: { status: string | null }) {
  const done = status === "resolved";
  return (
    <Badge variant={done ? "default" : status === "open" ? "destructive" : "secondary"}>
      {labelOf(REPORT_STATUS_LABEL, status)}
    </Badge>
  );
}
