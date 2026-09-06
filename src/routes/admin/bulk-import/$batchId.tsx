import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Download, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { rpc } from "@/lib/supabase-rpc";
import { formatDateTime, humanizeError } from "@/lib/format";
import { PageHeader, LoadingState, ErrorState } from "@/components/data-states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadBlob } from "@/lib/admin/bulk-import/columns";
import { errorsToCsv, type RowError } from "@/lib/admin/bulk-import/validate";
import { STATUS_LABELS, type ImportBatch } from "./history";

export const Route = createFileRoute("/admin/bulk-import/$batchId")({
  head: () => ({
    meta: [
      { title: "گزارش ورود گروهی | پنل مدیریت" },
      {
        name: "description",
        content: "جزئیات یک دسته ورود گروهی سوالات به همراه خطاها و بازگردانی",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "گزارش ورود گروهی سوالات" },
      { property: "og:description", content: "جزئیات و خطاهای یک دسته ورود سوال" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BatchDetailPage,
});

type BatchDetail = {
  batch: ImportBatch;
  exam_title: string | null;
  question_count: number;
  errors: (RowError & { batch_id: string; created_at: string })[];
};

function BatchDetailPage() {
  const { batchId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["admin-import-batch", batchId],
    queryFn: () => rpc<BatchDetail>("admin_get_question_import_batch", { p_batch_id: batchId }),
  });

  const rollback = useMutation({
    mutationFn: () =>
      rpc<{ deleted: number }>("admin_rollback_question_import", { p_batch_id: batchId }),
    onSuccess: (res) => {
      toast.success(`${res?.deleted ?? 0} سوال بازگردانی و حذف شد`);
      void qc.invalidateQueries({ queryKey: ["admin-import-batch", batchId] });
      void qc.invalidateQueries({ queryKey: ["admin-import-batches"] });
      void qc.invalidateQueries({ queryKey: ["admin-questions"] });
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  const detail = q.data;
  const batch = detail?.batch;
  if (!batch) return <ErrorState error={new Error("دسته ورود اطلاعات یافت نشد")} />;

  return (
    <div dir="rtl">
      <PageHeader
        title={`گزارش ورود: ${batch.file_name ?? "بدون نام"}`}
        description={`ثبت‌شده در ${formatDateTime(batch.created_at)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/bulk-import/history">
                <ArrowRight className="ms-1 size-4" />
                بازگشت به تاریخچه
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(detail?.errors ?? []).length === 0}
              onClick={() =>
                downloadBlob(
                  errorsToCsv(detail?.errors ?? []),
                  `import-errors-${batchId}.csv`,
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download className="ms-1 size-4" />
              دریافت گزارش خطا
            </Button>
            {batch.status !== "rolled_back" && (detail?.question_count ?? 0) > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={rollback.isPending}>
                    <Undo2 className="ms-1 size-4" />
                    بازگردانی این ورود
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent dir="rtl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>بازگردانی ورود گروهی</AlertDialogTitle>
                    <AlertDialogDescription>
                      تمام {detail?.question_count} سوال واردشده در این دسته به‌همراه گزینه‌ها و
                      اتصال آن‌ها به آزمون حذف می‌شود. این عملیات برگشت‌ناپذیر است.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>انصراف</AlertDialogCancel>
                    <AlertDialogAction onClick={() => rollback.mutate()}>
                      بله، بازگردانی کن
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="کل سطرها" value={batch.total_rows} />
        <Tile label="واردشده" value={batch.imported_rows} />
        <Tile label="تکراری" value={batch.duplicate_rows} />
        <Tile label="خطادار" value={batch.invalid_rows} />
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">وضعیت</p>
          <Badge className="mt-2">{STATUS_LABELS[batch.status] ?? batch.status}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>خطاهای این دسته</CardTitle>
          <CardDescription>
            {detail?.exam_title ? `آزمون مقصد: ${detail.exam_title}` : "بدون اتصال به آزمون"}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {(detail?.errors ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">خطایی ثبت نشده است.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>سطر</TableHead>
                  <TableHead>ستون</TableHead>
                  <TableHead>کد</TableHead>
                  <TableHead>پیام</TableHead>
                  <TableHead>مقدار</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detail?.errors ?? []).map((e, i) => (
                  <TableRow key={`${e.row_number}-${i}`}>
                    <TableCell>{e.row_number}</TableCell>
                    <TableCell className="font-mono text-xs">{e.field_name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{e.error_code}</TableCell>
                    <TableCell className="text-sm">{e.error_message}</TableCell>
                    <TableCell className="max-w-64 truncate text-sm text-muted-foreground">
                      {e.raw_value}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="mt-4">
        <Button variant="outline" onClick={() => void navigate({ to: "/admin/bulk-import" })}>
          ورود گروهی جدید
        </Button>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value.toLocaleString("fa-IR")}</p>
    </div>
  );
}
