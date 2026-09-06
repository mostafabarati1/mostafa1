import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Copy, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/format";
import type { AdminUserDetail } from "@/lib/admin/queries";
import {
  AccountStatusBadge,
  RoleBadge,
  SubscriptionStatusBadge,
} from "@/components/admin/user-detail/status-badges";

export function UserDetailHeader({
  detail,
  actions,
}: {
  detail: AdminUserDetail;
  actions?: ReactNode;
}) {
  const p = detail.profile;
  const activeSub = detail.summary?.active_subscription ?? null;
  const [copied, setCopied] = useState(false);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(p.id);
      setCopied(true);
      toast.success("شناسه کاربر کپی شد.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("کپی شناسه ممکن نشد.");
    }
  };

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-wrap items-start justify-between gap-4 pt-6">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {p.full_name?.trim() || "کاربر بی‌نام"}
          </h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Mail className="size-4" />
              {p.email ?? "—"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Phone className="size-4" />
              {p.mobile ?? "—"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <RoleBadge role={p.role} />
            <AccountStatusBadge status={p.status} />
            <SubscriptionStatusBadge status={activeSub ? activeSub.status : null} />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>عضویت: {formatDate(p.created_at)}</span>
            <span>
              آخرین فعالیت:{" "}
              {formatDateTime(detail.summary?.last_activity_at ?? p.updated_at ?? p.created_at)}
            </span>
            <button
              type="button"
              onClick={() => void copyId()}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 transition-colors hover:bg-accent"
              aria-label="کپی شناسه کاربر"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              <span dir="ltr" className="font-mono">
                {p.id.slice(0, 8)}…
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/users">
              <ArrowRight className="size-4" />
              بازگشت
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
