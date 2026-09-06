import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, ShieldOff, Sparkles, TimerOff, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/data-states";
import { DataTable, type Column } from "@/components/admin/data-table";
import { PageToolbar } from "@/components/admin/page-toolbar";
import { StatCard } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatNumber, humanizeError } from "@/lib/format";
import { rpc } from "@/lib/supabase-rpc";

export const Route = createFileRoute("/admin/subscriptions")({
  head: () => ({
    meta: [
      { title: "اشتراک‌ها | پنل مدیریت همراه استخدام" },
      { name: "description", content: "مدیریت اشتراک کاربران، تمدید و تغییر وضعیت." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "اشتراک‌ها | پنل مدیریت" },
      { property: "og:description", content: "مدیریت اشتراک کاربران سامانه." },
    ],
  }),
  component: SubscriptionsPage,
});

type SubRow = {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  mobile: string | null;
  plan_title: string | null;
  status: string;
  started_at: string;
  expires_at: string | null;
  created_at: string;
};

type SubStats = {
  total?: number;
  active?: number;
  trial?: number;
  expired?: number;
  cancelled?: number;
};

const STATUS_LABEL: Record<string, string> = {
  active: "فعال",
  trial: "آزمایشی",
  expired: "منقضی‌شده",
  cancelled: "لغوشده",
};

function SubscriptionsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [grantRow, setGrantRow] = useState<SubRow | null>(null);
  const [statusRow, setStatusRow] = useState<SubRow | null>(null);

  const statsQuery = useQuery({
    queryKey: ["admin-sub-stats"],
    queryFn: () => rpc<SubStats>("admin_subscription_stats"),
  });

  const query = useQuery({
    queryKey: ["admin-subscriptions", search, status === "all" ? "" : status],
    queryFn: () =>
      rpc<SubRow[]>("admin_list_subscriptions", {
        p_search: search || null,
        p_status: status === "all" ? null : status,
      }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    void qc.invalidateQueries({ queryKey: ["admin-sub-stats"] });
  };

  const setStatusMut = useMutation({
    mutationFn: (v: { user_id: string; status: string; reason?: string }) =>
      rpc("admin_set_subscription_status", {
        p_user_id: v.user_id,
        p_status: v.status,
        p_reason: v.reason || "admin-action",
      }),
    onSuccess: () => {
      toast.success("وضعیت اشتراک به‌روزرسانی شد");
      setStatusRow(null);
      invalidate();
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const grantMut = useMutation({
    mutationFn: (v: { user_id: string; days: number; reason?: string }) =>
      rpc("admin_grant_subscription", {
        p_user_id: v.user_id,
        p_days: v.days,
        p_reason: v.reason || "grant-by-admin",
      }),
    onSuccess: () => {
      toast.success("اشتراک تمدید شد");
      setGrantRow(null);
      invalidate();
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const stats = statsQuery.data ?? {};

  const columns: Column<SubRow>[] = [
    {
      key: "user",
      header: "کاربر",
      cell: (r) => (
        <div>
          <div className="font-medium">{r.full_name}</div>
          <div dir="ltr" className="text-xs text-muted-foreground">
            {r.email ?? r.mobile ?? "—"}
          </div>
        </div>
      ),
    },
    { key: "plan", header: "پلن", cell: (r) => r.plan_title ?? "—" },
    {
      key: "status",
      header: "وضعیت",
      cell: (r) => (
        <Badge
          variant={
            r.status === "active" ? "default" : r.status === "trial" ? "secondary" : "outline"
          }
        >
          {STATUS_LABEL[r.status] ?? r.status}
        </Badge>
      ),
    },
    { key: "start", header: "شروع", cell: (r) => formatDate(r.started_at) },
    { key: "end", header: "انقضا", cell: (r) => (r.expires_at ? formatDate(r.expires_at) : "—") },
    {
      key: "actions",
      header: "عملیات",
      cell: (r) => (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setGrantRow(r)}>
            تمدید
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setStatusRow(r)}>
            تغییر وضعیت
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="اشتراک‌ها" description="مدیریت اشتراک کاربران" />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="کل اشتراک‌ها"
          value={formatNumber(stats.total ?? 0)}
          icon={<Users className="size-5" />}
        />
        <StatCard
          label="فعال"
          value={formatNumber(stats.active ?? 0)}
          icon={<CreditCard className="size-5" />}
        />
        <StatCard
          label="آزمایشی"
          value={formatNumber(stats.trial ?? 0)}
          icon={<Sparkles className="size-5" />}
        />
        <StatCard
          label="منقضی‌شده"
          value={formatNumber(stats.expired ?? 0)}
          icon={<TimerOff className="size-5" />}
        />
        <StatCard
          label="لغوشده"
          value={formatNumber(stats.cancelled ?? 0)}
          icon={<ShieldOff className="size-5" />}
        />
      </div>

      <DataTable
        columns={columns}
        rows={query.data}
        isLoading={query.isLoading}
        error={query.isError ? query.error : undefined}
        onRetry={() => void query.refetch()}
        rowKey={(r) => r.id}
        emptyTitle="اشتراکی یافت نشد"
        emptyDescription="فیلترهای دیگری را امتحان کنید."
        toolbar={
          <PageToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="جست‌وجوی نام، ایمیل یا موبایل…"
            filters={
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="همه وضعیت‌ها" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                  <SelectItem value="active">فعال</SelectItem>
                  <SelectItem value="trial">آزمایشی</SelectItem>
                  <SelectItem value="expired">منقضی‌شده</SelectItem>
                  <SelectItem value="cancelled">لغوشده</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        }
      />

      <Dialog open={!!grantRow} onOpenChange={(o) => !o && setGrantRow(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تمدید اشتراک {grantRow?.full_name}</DialogTitle>
            <DialogDescription>تعداد روز تمدید و دلیل را وارد کنید.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const days = Number(fd.get("days"));
              if (days > 0 && grantRow)
                grantMut.mutate({
                  user_id: grantRow.user_id,
                  days,
                  reason: String(fd.get("reason") ?? ""),
                });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="days">روز تمدید</Label>
              <Input id="days" type="number" name="days" min={1} defaultValue={30} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grant-reason">دلیل (اختیاری)</Label>
              <Input id="grant-reason" name="reason" placeholder="مثلاً پشتیبانی مشتری" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGrantRow(null)}>
                انصراف
              </Button>
              <Button type="submit" disabled={grantMut.isPending}>
                {grantMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "تمدید"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!statusRow} onOpenChange={(o) => !o && setStatusRow(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تغییر وضعیت اشتراک {statusRow?.full_name}</DialogTitle>
            <DialogDescription>وضعیت جدید اشتراک را انتخاب کنید.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const next = String(fd.get("status") ?? "");
              if (next && statusRow)
                setStatusMut.mutate({
                  user_id: statusRow.user_id,
                  status: next,
                  reason: String(fd.get("reason") ?? ""),
                });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="new-status">وضعیت جدید</Label>
              <select
                id="new-status"
                name="status"
                defaultValue={statusRow?.status === "active" ? "cancelled" : "active"}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="active">فعال</option>
                <option value="expired">منقضی‌شده</option>
                <option value="cancelled">لغوشده</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status-reason">دلیل (اختیاری)</Label>
              <Input id="status-reason" name="reason" placeholder="مثلاً درخواست کاربر" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStatusRow(null)}>
                انصراف
              </Button>
              <Button type="submit" disabled={setStatusMut.isPending}>
                {setStatusMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "ثبت تغییر"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
