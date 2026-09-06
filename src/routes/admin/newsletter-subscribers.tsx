import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Download, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/data-states";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime, formatNumber, humanizeError } from "@/lib/format";
import {
  deleteNewsletterSubscriber,
  exportNewsletterSubscribers,
  getNewsletterSubscriberStats,
  listNewsletterSubscribers,
  setNewsletterSubscriberStatus,
  type SubscriberRow,
} from "@/lib/admin/newsletter-subscribers.functions";

export const Route = createFileRoute("/admin/newsletter-subscribers")({
  head: () => ({
    meta: [
      { title: "مشترکان خبرنامه | پنل مدیریت همراه استخدام" },
      {
        name: "description",
        content: "مدیریت مشترکان خبرنامه: جست‌وجو، فیلتر وضعیت، لغو/فعال‌سازی، حذف و خروجی CSV.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "مشترکان خبرنامه | پنل مدیریت" },
      { property: "og:description", content: "مدیریت فهرست مشترکان خبرنامه همراه استخدام." },
    ],
  }),
  component: SubscribersPage,
});

type StatusFilter = "all" | "pending" | "active" | "unsubscribed" | "bounced";

const STATUS_META: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  active: { label: "اشتراک فعال", variant: "default" },
  pending: { label: "در انتظار تأیید", variant: "secondary" },
  unsubscribed: { label: "لغوشده", variant: "secondary" },
  bounced: { label: "برگشت‌خورده", variant: "destructive" },
};

const PAGE_SIZE = 25;

function csvCell(value: string | null): string {
  const text = (value ?? "").replace(/\r?\n/g, " ");
  return `"${text.replace(/"/g, '""')}"`;
}

function SubscribersPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listNewsletterSubscribers);
  const fetchStats = useServerFn(getNewsletterSubscriberStats);
  const changeStatus = useServerFn(setNewsletterSubscriberStatus);
  const removeSubscriber = useServerFn(deleteNewsletterSubscriber);
  const fetchExport = useServerFn(exportNewsletterSubscribers);

  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<SubscriberRow | null>(null);

  const listQuery = useQuery({
    queryKey: ["admin", "newsletter", "subscribers", q, status, page],
    queryFn: () => fetchList({ data: { q: q || undefined, status, page, pageSize: PAGE_SIZE } }),
  });

  const statsQuery = useQuery({
    queryKey: ["admin", "newsletter", "subscribers", "stats"],
    queryFn: () => fetchStats(),
  });

  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ["admin", "newsletter", "subscribers"] });

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: "active" | "unsubscribed" }) =>
      changeStatus({ data: vars }),
    onSuccess: () => {
      toast.success("وضعیت مشترک به‌روزرسانی شد.");
      invalidate();
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeSubscriber({ data: { id } }),
    onSuccess: () => {
      toast.success("مشترک حذف شد.");
      setPendingDelete(null);
      invalidate();
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const exportMutation = useMutation({
    mutationFn: () => fetchExport({ data: { q: q || undefined, status } }),
    onSuccess: (rows) => {
      const header = ["ایمیل", "نام", "منبع", "وضعیت", "تاریخ ثبت"];
      const lines = [
        header.map(csvCell).join(","),
        ...rows.map((row) =>
          [
            csvCell(row.email),
            csvCell(row.name),
            csvCell(row.source),
            csvCell(STATUS_META[row.status]?.label ?? row.status),
            csvCell(formatDateTime(row.created_at)),
          ].join(","),
        ),
      ];
      const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "newsletter-subscribers.csv";
      link.click();
      URL.revokeObjectURL(url);
      toast.success("خروجی CSV آماده شد.");
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const columns = useMemo<Column<SubscriberRow>[]>(
    () => [
      {
        key: "email",
        header: "ایمیل",
        cell: (row) => (
          <span dir="ltr" className="font-medium text-foreground">
            {row.email ?? "—"}
          </span>
        ),
      },
      { key: "name", header: "نام", cell: (row) => row.name ?? "—" },
      { key: "source", header: "منبع", cell: (row) => row.source ?? "—" },
      {
        key: "status",
        header: "وضعیت",
        cell: (row) => {
          const meta = STATUS_META[row.status] ?? {
            label: row.status,
            variant: "secondary" as const,
          };
          return <Badge variant={meta.variant}>{meta.label}</Badge>;
        },
      },
      { key: "created_at", header: "تاریخ ثبت", cell: (row) => formatDateTime(row.created_at) },
      {
        key: "actions",
        header: "عملیات",
        cell: (row) => (
          <div className="flex flex-wrap gap-2">
            {row.status === "unsubscribed" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate({ id: row.id, status: "active" })}
              >
                فعال‌سازی مجدد
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate({ id: row.id, status: "unsubscribed" })}
              >
                لغو اشتراک
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              aria-label={`حذف مشترک ${row.email ?? ""}`}
              onClick={() => setPendingDelete(row)}
            >
              <Trash2 aria-hidden /> حذف
            </Button>
          </div>
        ),
      },
    ],
    [statusMutation],
  );

  const stats = statsQuery.data;

  return (
    <div>
      <PageHeader
        title="مشترکان خبرنامه"
        description="فهرست مشترکان خبرنامه؛ جست‌وجو، فیلتر وضعیت، لغو یا فعال‌سازی اشتراک، حذف و خروجی CSV."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/newsletter">
                <ArrowRight aria-hidden /> بازگشت به اخبار
              </Link>
            </Button>
            <Button onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
              {exportMutation.isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Download aria-hidden />
              )}
              خروجی CSV
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: "کل مشترکان", value: stats?.total ?? 0 },
          { label: "اشتراک فعال", value: stats?.active ?? 0 },
          { label: "ثبت‌نام ماه جاری", value: stats?.this_month ?? 0 },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-4">
              <CardDescription>{kpi.label}</CardDescription>
              <CardTitle className="text-2xl">{formatNumber(kpi.value)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={listQuery.data?.items}
        isLoading={listQuery.isPending}
        error={listQuery.error}
        onRetry={() => void listQuery.refetch()}
        rowKey={(row) => row.id}
        emptyTitle="مشترکی یافت نشد"
        emptyDescription="با تغییر عبارت جست‌وجو یا فیلتر وضعیت دوباره تلاش کنید."
        page={page}
        pageSize={PAGE_SIZE}
        total={listQuery.data?.total ?? 0}
        onPageChange={setPage}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setQ(searchInput.trim());
              }}
            >
              <Input
                className="w-64"
                placeholder="جست‌وجو در ایمیل یا نام"
                aria-label="جست‌وجوی مشترکان"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <Button type="submit" variant="outline">
                <Search aria-hidden /> جست‌وجو
              </Button>
            </form>

            <Select
              value={status}
              onValueChange={(v) => {
                setPage(1);
                setStatus(v as StatusFilter);
              }}
            >
              <SelectTrigger className="w-44" aria-label="فیلتر وضعیت مشترک">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                <SelectItem value="active">اشتراک فعال</SelectItem>
                <SelectItem value="pending">در انتظار تأیید</SelectItem>
                <SelectItem value="unsubscribed">لغوشده</SelectItem>
                <SelectItem value="bounced">برگشت‌خورده</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <Dialog open={pendingDelete != null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف مشترک خبرنامه</DialogTitle>
            <DialogDescription>
              این عملیات قابل بازگشت نیست. آیا از حذف این مشترک اطمینان دارید؟
            </DialogDescription>
          </DialogHeader>
          <p dir="ltr" className="text-sm text-muted-foreground">
            {pendingDelete?.email ?? "—"}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              انصراف
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Trash2 aria-hidden />
              )}
              حذف مشترک
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
