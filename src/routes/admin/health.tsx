import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle,
  CreditCard,
  Database,
  MessageSquare,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, LoadingState, ErrorState } from "@/components/data-states";
import { StatCard } from "@/components/admin/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { rpc } from "@/lib/supabase-rpc";
import { adminError } from "@/lib/admin/error-messages";
import { getIntegrationsHealth, type IntegrationStatus } from "@/lib/admin/health.functions";
import { formatDateTime, formatNumber } from "@/lib/format";

export const Route = createFileRoute("/admin/health")({
  head: () => ({
    meta: [
      { title: "سلامت سامانه | پنل مدیریت همراه استخدام" },
      {
        name: "description",
        content: "پایش پایگاه داده، سرویس‌های پیامک، هوش مصنوعی، درگاه پرداخت و خطاهای اخیر.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "سلامت سامانه | پنل مدیریت" },
      { property: "og:description", content: "پایش وضعیت سرویس‌ها و خطاهای سامانه." },
    ],
  }),
  component: HealthPage,
});

type DbHealth = {
  ok: boolean;
  missing_tables: string[];
  latency_ms: number;
  checked_at: string;
};

type ErrorStats = {
  last_24h: number;
  last_7d: number;
  unresolved: number;
  by_severity: Record<string, number>;
  latest: { created_at: string; message: string; source: string } | null;
};

type ErrorRow = {
  id: string;
  created_at: string;
  severity: string;
  source: string;
  message: string;
  error_code: string | null;
  operation: string | null;
  resolved_at: string | null;
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "بحرانی",
  error: "خطا",
  warning: "هشدار",
  info: "اطلاع",
};

function HealthPage() {
  const qc = useQueryClient();
  const integrations = useServerFn(getIntegrationsHealth);

  const db = useQuery({
    queryKey: ["admin-health", "db"],
    queryFn: () => rpc<DbHealth>("admin_db_health"),
    refetchInterval: 60_000,
  });

  const errors = useQuery({
    queryKey: ["admin-health", "errors"],
    queryFn: () => rpc<ErrorStats>("admin_error_stats"),
    refetchInterval: 60_000,
  });

  const errorList = useQuery({
    queryKey: ["admin-health", "error-list"],
    queryFn: () =>
      rpc<{ items: ErrorRow[]; total: number }>("admin_list_errors", {
        p_unresolved_only: true,
        p_page: 1,
        p_page_size: 10,
      }),
  });

  const services = useQuery({
    queryKey: ["admin-health", "integrations"],
    queryFn: () => integrations({}),
  });

  const resolveMut = useMutation({
    mutationFn: (id: string) => rpc("admin_resolve_error", { p_id: id, p_note: "بررسی شد" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-health"] });
      toast.success("خطا بسته شد");
    },
    onError: (e) => toast.error(adminError(e)),
  });

  const refreshAll = () => void qc.invalidateQueries({ queryKey: ["admin-health"] });
  const stats = errors.data;

  return (
    <div>
      <PageHeader
        title="سلامت سامانه"
        description="پایش پایگاه داده، سرویس‌های جانبی و خطاهای اخیر"
        actions={
          <Button variant="outline" onClick={refreshAll}>
            <RefreshCw className="size-4" />
            بررسی مجدد
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="تأخیر پایگاه داده"
          value={db.data ? `${formatNumber(db.data.latency_ms, 2)} ms` : "…"}
          icon={<Database className="size-5" />}
        />
        <StatCard
          label="خطاهای ۲۴ ساعت اخیر"
          value={formatNumber(stats?.last_24h ?? 0)}
          icon={<AlertTriangle className="size-5" />}
        />
        <StatCard
          label="خطاهای باز"
          value={formatNumber(stats?.unresolved ?? 0)}
          icon={<Activity className="size-5" />}
        />
        <StatCard
          label="خطاهای ۷ روز اخیر"
          value={formatNumber(stats?.last_7d ?? 0)}
          icon={<XCircle className="size-5" />}
        />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="size-4 text-primary" />
            پایگاه داده
          </CardTitle>
        </CardHeader>
        <CardContent>
          {db.isLoading ? (
            <Badge variant="secondary">در حال بررسی…</Badge>
          ) : db.isError ? (
            <div className="flex flex-col gap-2">
              <Badge variant="destructive">قطع</Badge>
              <ErrorState error={db.error} onRetry={() => void db.refetch()} />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant={db.data?.ok ? "default" : "destructive"}>
                {db.data?.ok ? "سالم" : "ناقص"}
              </Badge>
              <span className="text-muted-foreground">
                آخرین بررسی: {formatDateTime(db.data?.checked_at)}
              </span>
              {db.data && db.data.missing_tables.length > 0 && (
                <span className="text-destructive">
                  جداول ناموجود: {db.data.missing_tables.join("، ")}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <ServiceCard
          title="پیامک"
          icon={<MessageSquare className="size-4 text-primary" />}
          status={services.data?.sms}
          loading={services.isLoading}
        />
        <ServiceCard
          title="هوش مصنوعی"
          icon={<Bot className="size-4 text-primary" />}
          status={services.data?.ai}
          loading={services.isLoading}
        />
        <ServiceCard
          title="درگاه پرداخت"
          icon={<CreditCard className="size-4 text-primary" />}
          status={services.data?.gateway}
          loading={services.isLoading}
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-primary" />
            خطاهای باز
          </CardTitle>
        </CardHeader>
        <CardContent>
          {errorList.isLoading ? (
            <LoadingState rows={4} />
          ) : errorList.isError ? (
            <ErrorState error={errorList.error} onRetry={() => void errorList.refetch()} />
          ) : (errorList.data?.items ?? []).length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="size-4 text-primary" />
              خطای بازی ثبت نشده است.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">زمان</TableHead>
                    <TableHead className="text-right">شدت</TableHead>
                    <TableHead className="text-right">سرویس</TableHead>
                    <TableHead className="text-right">پیام</TableHead>
                    <TableHead className="text-right">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(errorList.data?.items ?? []).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(e.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            e.severity === "critical" || e.severity === "error"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {SEVERITY_LABEL[e.severity] ?? e.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{e.source}</TableCell>
                      <TableCell className="max-w-sm text-xs">{e.message}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={resolveMut.isPending}
                          onClick={() => resolveMut.mutate(e.id)}
                        >
                          بستن
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ServiceCard({
  title,
  icon,
  status,
  loading,
}: {
  title: string;
  icon: React.ReactNode;
  status: IntegrationStatus | undefined;
  loading: boolean;
}) {
  const tone = !status?.configured ? "destructive" : status.enabled ? "default" : "secondary";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {loading ? (
          <Badge variant="secondary">در حال بررسی…</Badge>
        ) : (
          <>
            <Badge variant={tone}>
              {!status?.configured ? "پیکربندی نشده" : status.enabled ? "فعال" : "غیرفعال"}
            </Badge>
            <p className="text-muted-foreground">{status?.detail ?? "—"}</p>
            {status?.secret_masked && (
              <p dir="ltr" className="text-left font-mono text-xs text-muted-foreground">
                {status.secret_masked}
              </p>
            )}
            {status?.updated_at && (
              <p className="text-xs text-muted-foreground">
                آخرین تغییر: {formatDateTime(status.updated_at)}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
