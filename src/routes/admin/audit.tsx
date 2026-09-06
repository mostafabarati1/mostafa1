import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, Eye } from "lucide-react";
import { PageHeader } from "@/components/data-states";
import { DataTable, type Column } from "@/components/admin/data-table";
import { PageToolbar } from "@/components/admin/page-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { formatDateTime } from "@/lib/format";
import { rpc } from "@/lib/supabase-rpc";
import { maskSensitive } from "@/lib/admin/user-detail-utils";

export const Route = createFileRoute("/admin/audit")({
  head: () => ({
    meta: [
      { title: "سابقه فعالیت | پنل مدیریت همراه استخدام" },
      { name: "description", content: "سوابق کامل فعالیت مدیران با فیلتر، جزئیات و خروجی CSV." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "سابقه فعالیت | پنل مدیریت" },
      { property: "og:description", content: "پیگیری تغییرات و عملیات مدیران سامانه." },
    ],
  }),
  component: AuditPage,
});

const PAGE_SIZE = 25;

type AuditRow = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  entity: string | null;
  entity_id: string | null;
  action: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type AuditPageData = { items: AuditRow[]; total: number };
type Facets = { actions: string[]; entities: string[] };

function isFailure(row: AuditRow) {
  return (row.details as { success?: boolean } | null)?.success === false;
}

function toCsv(rows: AuditRow[]) {
  const head = ["created_at", "actor", "entity", "entity_id", "action", "result", "reason"];
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.created_at,
      r.actor_name ?? "",
      r.entity ?? "",
      r.entity_id ?? "",
      r.action ?? "",
      isFailure(r) ? "failure" : "success",
      (r.details as { reason?: string } | null)?.reason ?? "",
    ]
      .map(escape)
      .join(","),
  );
  return `\uFEFF${head.join(",")}\n${lines.join("\n")}`;
}

function AuditPage() {
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState("all");
  const [action, setAction] = useState("all");
  const [result, setResult] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditRow | null>(null);

  const filters = useMemo(
    () => ({
      p_search: search.trim() || null,
      p_entity: entity === "all" ? null : entity,
      p_action: action === "all" ? null : action,
      p_result: result === "all" ? null : result,
      p_from: from ? new Date(from).toISOString() : null,
      p_to: to ? new Date(`${to}T23:59:59`).toISOString() : null,
    }),
    [search, entity, action, result, from, to],
  );

  const facetsQuery = useQuery({
    queryKey: ["admin-audit-facets"],
    queryFn: () => rpc<Facets>("admin_audit_facets"),
  });

  const query = useQuery({
    queryKey: ["admin-audit", filters, page],
    queryFn: () =>
      rpc<AuditPageData>("admin_list_audit", {
        ...filters,
        p_page: page,
        p_page_size: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const exportQuery = useQuery({
    queryKey: ["admin-audit-export", filters],
    queryFn: () =>
      rpc<AuditPageData>("admin_list_audit", { ...filters, p_page: 1, p_page_size: 200 }),
    enabled: false,
  });

  const download = async () => {
    const res = await exportQuery.refetch();
    const rows = res.data?.items ?? [];
    if (rows.length === 0) return;
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: Column<AuditRow>[] = [
    {
      key: "time",
      header: "زمان",
      cell: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDateTime(r.created_at)}
        </span>
      ),
    },
    { key: "actor", header: "مدیر", cell: (r) => r.actor_name ?? "سیستم" },
    {
      key: "entity",
      header: "موجودیت",
      cell: (r) => <Badge variant="secondary">{r.entity ?? "—"}</Badge>,
    },
    {
      key: "action",
      header: "عملیات",
      cell: (r) => (
        <span dir="ltr" className="text-xs">
          {r.action ?? "—"}
        </span>
      ),
    },
    {
      key: "result",
      header: "نتیجه",
      cell: (r) => (
        <Badge variant={isFailure(r) ? "destructive" : "default"}>
          {isFailure(r) ? "ناموفق" : "موفق"}
        </Badge>
      ),
    },
    {
      key: "reason",
      header: "دلیل",
      cell: (r) => (
        <span className="line-clamp-1 max-w-48 text-xs text-muted-foreground">
          {(r.details as { reason?: string } | null)?.reason ?? "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "جزئیات",
      className: "w-16",
      cell: (r) => (
        <Button size="icon" variant="ghost" aria-label="مشاهده جزئیات" onClick={() => setDetail(r)}>
          <Eye className="size-4" />
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="سابقه فعالیت"
        description="همه عملیات مدیران با امکان فیلتر، مشاهده جزئیات و خروجی CSV"
        actions={
          <Button
            variant="outline"
            onClick={() => void download()}
            disabled={exportQuery.isFetching}
          >
            <Download className="size-4" />
            خروجی CSV
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={query.data?.items}
        isLoading={query.isLoading}
        error={query.isError ? query.error : undefined}
        onRetry={() => void query.refetch()}
        rowKey={(r) => r.id}
        page={page}
        pageSize={PAGE_SIZE}
        total={query.data?.total ?? 0}
        onPageChange={setPage}
        emptyTitle="رکوردی یافت نشد"
        emptyDescription="فیلترهای دیگری را امتحان کنید."
        toolbar={
          <PageToolbar
            search={search}
            onSearchChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            searchPlaceholder="جست‌وجوی مدیر، عملیات یا دلیل…"
            filters={
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={entity}
                  onValueChange={(v) => {
                    setEntity(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="همه موجودیت‌ها" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه موجودیت‌ها</SelectItem>
                    {(facetsQuery.data?.entities ?? []).map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={action}
                  onValueChange={(v) => {
                    setAction(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="همه عملیات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه عملیات</SelectItem>
                    {(facetsQuery.data?.actions ?? []).map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={result}
                  onValueChange={(v) => {
                    setResult(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="نتیجه" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه</SelectItem>
                    <SelectItem value="success">موفق</SelectItem>
                    <SelectItem value="failure">ناموفق</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  aria-label="از تاریخ"
                  className="w-36"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPage(1);
                  }}
                />
                <Input
                  type="date"
                  aria-label="تا تاریخ"
                  className="w-36"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            }
          />
        }
      />

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>جزئیات رویداد</DialogTitle>
            <DialogDescription>
              {detail ? `${detail.entity ?? "—"} — ${detail.action ?? "—"}` : ""} (
              {detail ? formatDateTime(detail.created_at) : ""})
            </DialogDescription>
          </DialogHeader>
          <pre
            dir="ltr"
            className="max-h-96 overflow-auto rounded-xl bg-muted p-4 text-left font-mono text-xs"
          >
            {JSON.stringify(maskSensitive(detail?.details ?? {}), null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
