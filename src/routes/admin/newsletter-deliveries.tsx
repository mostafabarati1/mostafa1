import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, PlayCircle } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/data-states";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime, formatNumber, humanizeError } from "@/lib/format";
import {
  getNewsletterOverview,
  listNewsletterDeliveries,
  listNewsletterJobs,
  runNewsletterQueue,
  type NewsletterDeliveryRow,
  type NewsletterJobRow,
} from "@/lib/admin/newsletter.functions";

export const Route = createFileRoute("/admin/newsletter-deliveries")({
  head: () => ({
    meta: [
      { title: "صف و گزارش ارسال خبرنامه | پنل مدیریت همراه استخدام" },
      {
        name: "description",
        content: "پایش صف ارسال پیامک خبرنامه، تلاش‌های مجدد و گزارش تحویل پیام‌ها.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "صف و گزارش ارسال خبرنامه" },
      { property: "og:description", content: "پایش وضعیت ارسال اعلان‌های خبرنامه." },
    ],
  }),
  component: DeliveriesPage,
});

const JOB_STATUS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  pending: { label: "در صف", variant: "secondary" },
  processing: { label: "در حال ارسال", variant: "secondary" },
  sent: { label: "ارسال‌شده", variant: "default" },
  failed: { label: "ناموفق", variant: "destructive" },
  skipped: { label: "رد شده", variant: "secondary" },
};

function DeliveriesPage() {
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getNewsletterOverview);
  const fetchJobs = useServerFn(listNewsletterJobs);
  const fetchDeliveries = useServerFn(listNewsletterDeliveries);
  const runQueue = useServerFn(runNewsletterQueue);

  const [jobStatus, setJobStatus] = useState<
    "all" | "pending" | "processing" | "sent" | "failed" | "skipped"
  >("all");

  const overviewQuery = useQuery({
    queryKey: ["admin", "newsletter", "overview"],
    queryFn: () => fetchOverview(),
  });

  const jobsQuery = useQuery({
    queryKey: ["admin", "newsletter", "jobs", jobStatus],
    queryFn: () => fetchJobs({ data: { status: jobStatus, limit: 100 } }),
    refetchInterval: 30_000,
  });

  const deliveriesQuery = useQuery({
    queryKey: ["admin", "newsletter", "deliveries"],
    queryFn: () => fetchDeliveries({ data: { limit: 100 } }),
  });

  const run = useMutation({
    mutationFn: () => runQueue({ data: { limit: 50 } }),
    onSuccess: (summary) => {
      toast.success(
        `پردازش شد — ارسال: ${formatNumber(summary.sent)} · ناموفق: ${formatNumber(summary.failed)} · رد شده: ${formatNumber(summary.skipped)}`,
      );
      void qc.invalidateQueries({ queryKey: ["admin", "newsletter"] });
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const jobColumns = useMemo<Column<NewsletterJobRow>[]>(
    () => [
      {
        key: "news",
        header: "خبر",
        cell: (row) => (
          <div className="min-w-48">
            <p className="font-medium text-foreground">{row.news_title ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</p>
          </div>
        ),
      },
      { key: "channel", header: "کانال", cell: (row) => <span>{row.channel}</span> },
      {
        key: "status",
        header: "وضعیت",
        cell: (row) => {
          const meta = JOB_STATUS[row.status] ?? {
            label: row.status,
            variant: "secondary" as const,
          };
          return <Badge variant={meta.variant}>{meta.label}</Badge>;
        },
      },
      { key: "attempts", header: "تلاش", cell: (row) => formatNumber(row.attempts) },
      {
        key: "error",
        header: "خطا",
        cell: (row) => (
          <span className="text-xs text-muted-foreground">{row.last_error ?? "—"}</span>
        ),
      },
    ],
    [],
  );

  const deliveryColumns = useMemo<Column<NewsletterDeliveryRow>[]>(
    () => [
      { key: "recipient", header: "گیرنده", cell: (row) => <span dir="ltr">{row.recipient}</span> },
      { key: "provider", header: "سرویس", cell: (row) => row.provider ?? "—" },
      {
        key: "status",
        header: "وضعیت",
        cell: (row) => (
          <Badge variant={row.status === "failed" ? "destructive" : "default"}>{row.status}</Badge>
        ),
      },
      {
        key: "sent_at",
        header: "زمان",
        cell: (row) => formatDateTime(row.sent_at ?? row.created_at),
      },
      {
        key: "error",
        header: "خطا",
        cell: (row) => <span className="text-xs text-muted-foreground">{row.error ?? "—"}</span>,
      },
    ],
    [],
  );

  const overview = overviewQuery.data;

  return (
    <div>
      <PageHeader
        title="صف و گزارش ارسال خبرنامه"
        description="وضعیت ارسال پیامک‌های خبرنامه، تلاش‌های مجدد خودکار و گزارش تحویل."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/newsletter">
                <ArrowRight aria-hidden /> بازگشت به اخبار
              </Link>
            </Button>
            <Button onClick={() => run.mutate()} disabled={run.isPending}>
              {run.isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <PlayCircle aria-hidden />
              )}
              پردازش صف
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "در صف", value: overview?.delivery.queued_jobs ?? 0 },
          { label: "ارسال موفق", value: overview?.delivery.sms_sent ?? 0 },
          { label: "ناموفق", value: overview?.delivery.sms_failed ?? 0 },
          { label: "کل رکوردهای تحویل", value: overview?.delivery.total ?? 0 },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardDescription>{kpi.label}</CardDescription>
              <CardTitle className="text-2xl">{formatNumber(kpi.value)}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0" />
          </Card>
        ))}
      </div>

      <Tabs defaultValue="jobs">
        <TabsList>
          <TabsTrigger value="jobs">صف ارسال</TabsTrigger>
          <TabsTrigger value="deliveries">گزارش تحویل</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="mt-4">
          <DataTable
            columns={jobColumns}
            rows={jobsQuery.data}
            isLoading={jobsQuery.isPending}
            error={jobsQuery.error}
            onRetry={() => void jobsQuery.refetch()}
            rowKey={(row) => row.id}
            emptyTitle="صف خالی است"
            emptyDescription="کار ارسالی برای پردازش وجود ندارد."
            toolbar={
              <Select value={jobStatus} onValueChange={(v) => setJobStatus(v as typeof jobStatus)}>
                <SelectTrigger className="w-44" aria-label="فیلتر وضعیت صف">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="pending">در صف</SelectItem>
                  <SelectItem value="processing">در حال ارسال</SelectItem>
                  <SelectItem value="sent">ارسال‌شده</SelectItem>
                  <SelectItem value="failed">ناموفق</SelectItem>
                  <SelectItem value="skipped">رد شده</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </TabsContent>

        <TabsContent value="deliveries" className="mt-4">
          <DataTable
            columns={deliveryColumns}
            rows={deliveriesQuery.data}
            isLoading={deliveriesQuery.isPending}
            error={deliveriesQuery.error}
            onRetry={() => void deliveriesQuery.refetch()}
            rowKey={(row) => row.id}
            emptyTitle="گزارشی ثبت نشده است"
            emptyDescription="پس از اولین ارسال، گزارش تحویل اینجا نمایش داده می‌شود."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
