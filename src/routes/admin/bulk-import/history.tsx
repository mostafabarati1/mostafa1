import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { rpc } from "@/lib/supabase-rpc";
import { formatDateTime } from "@/lib/format";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/data-states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/bulk-import/history")({
  head: () => ({
    meta: [
      { title: "تاریخچه ورود گروهی سوالات | پنل مدیریت" },
      { name: "description", content: "فهرست دسته‌های ورود گروهی سوالات با آمار و وضعیت هر دسته" },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "تاریخچه ورود گروهی سوالات" },
      { property: "og:description", content: "پیگیری دسته‌های ورود گروهی سوالات" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});

export type ImportBatch = {
  id: string;
  file_name: string | null;
  file_type: string | null;
  exam_title: string | null;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  imported_rows: number;
  duplicate_rows: number;
  status: string;
  created_at: string;
  completed_at: string | null;
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "در انتظار",
  importing: "در حال ورود",
  completed: "تکمیل‌شده",
  failed: "ناموفق",
  rolled_back: "بازگردانی‌شده",
};

const ALL = "__all__";

function HistoryPage() {
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(0);
  const limit = 20;

  const q = useQuery({
    queryKey: ["admin-import-batches", status, page],
    queryFn: () =>
      rpc<{ total: number; items: ImportBatch[] }>("admin_list_question_import_batches", {
        p_limit: limit,
        p_offset: page * limit,
        p_status: status === ALL ? null : status,
      }),
  });

  return (
    <div dir="rtl">
      <PageHeader
        title="تاریخچه ورود گروهی"
        description="فهرست تمام دسته‌های ورود سوال به همراه آمار و امکان بازگردانی"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/bulk-import">
              <ArrowRight className="ms-1 size-4" />
              ورود جدید
            </Link>
          </Button>
        }
      />

      <div className="mb-4 w-56">
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>همه وضعیت‌ها</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (q.data?.items ?? []).length === 0 ? (
        <EmptyState title="هنوز ورودی ثبت نشده است" />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>فایل</TableHead>
                  <TableHead>آزمون</TableHead>
                  <TableHead>کل</TableHead>
                  <TableHead>واردشده</TableHead>
                  <TableHead>تکراری</TableHead>
                  <TableHead>خطا</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(q.data?.items ?? []).map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="max-w-52 truncate">{b.file_name ?? "—"}</TableCell>
                    <TableCell className="max-w-40 truncate">{b.exam_title ?? "—"}</TableCell>
                    <TableCell>{b.total_rows}</TableCell>
                    <TableCell>{b.imported_rows}</TableCell>
                    <TableCell>{b.duplicate_rows}</TableCell>
                    <TableCell>{b.invalid_rows}</TableCell>
                    <TableCell>
                      <Badge variant={b.status === "completed" ? "default" : "secondary"}>
                        {STATUS_LABELS[b.status] ?? b.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDateTime(b.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/admin/bulk-import/$batchId" params={{ batchId: b.id }}>
                          جزئیات
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          قبلی
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={(page + 1) * limit >= (q.data?.total ?? 0)}
          onClick={() => setPage((p) => p + 1)}
        >
          بعدی
        </Button>
      </div>
    </div>
  );
}
