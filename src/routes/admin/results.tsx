import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState, EmptyState, ErrorState, PageHeader } from "@/components/data-states";
import { formatDateTime, formatPercent, humanizeError } from "@/lib/format";
import { rpc } from "@/lib/supabase-rpc";

export const Route = createFileRoute("/admin/results")({
  head: () => ({
    meta: [
      { title: "نتایج آزمون‌ها | همراه استخدام" },
      { name: "description", content: "مدیریت نتایج آزمون‌های داوطلبان" },
    ],
  }),
  component: ResultsPage,
});

type Attempt = {
  id: string;
  exam_id: string;
  exam_title: string;
  candidate_id: string;
  full_name: string;
  email: string | null;
  status: string;
  started_at: string | null;
  submitted_at: string | null;
  correct_count: number;
  earned_score: number;
  total_score: number;
  passed: boolean | null;
};

function ResultsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["admin-attempts", search, status, page],
    queryFn: async () => {
      const { items, total } = await rpc<{ items: Attempt[]; total: number }>(
        "list_attempts_admin",
        {
          p_search: search || null,
          p_status: status || null,
          p_page: page,
          p_page_size: 20,
        },
      );
      return { items, total };
    },
  });

  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 20));

  return (
    <div>
      <PageHeader title="نتایج آزمون‌ها" description="مشاهده و مدیریت نتایج داوطلبان" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-72 max-w-full">
          <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pr-9"
            placeholder="جستجوی نام یا ایمیل…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="همه وضعیت‌ها" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">همه وضعیت‌ها</SelectItem>
            <SelectItem value="in_progress">در حال انجام</SelectItem>
            <SelectItem value="submitted">ارسال شده</SelectItem>
            <SelectItem value="expired">منقضی</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isLoading ? (
        <LoadingState rows={8} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (query.data?.items ?? []).length === 0 ? (
        <EmptyState title="رکوردی یافت نشد" description="فیلترهای دیگری را امتحان کنید." />
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>داوطلب</TableHead>
                  <TableHead>آزمون</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>نمره</TableHead>
                  <TableHead>درصد</TableHead>
                  <TableHead>نتیجه</TableHead>
                  <TableHead>ارسال</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data?.items ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.full_name}</div>
                      <div dir="ltr" className="text-xs text-muted-foreground">
                        {a.email ?? ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{a.exam_title}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{a.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {a.earned_score} / {a.total_score}
                    </TableCell>
                    <TableCell>
                      {formatPercent(a.total_score ? (a.earned_score / a.total_score) * 100 : 0)}
                    </TableCell>
                    <TableCell>
                      {a.passed === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Badge variant={a.passed ? "default" : "destructive"}>
                          {a.passed ? "قبول" : "رد"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(a.submitted_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              مجموع {query.data?.total ?? 0} تلاش
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                قبلی
              </Button>
              <span className="px-2 text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                بعدی
              </Button>
            </div>
          </div>
        </>
      )}

      {query.isError && (
        <p className="mt-2 text-sm text-destructive">{humanizeError(query.error)}</p>
      )}
    </div>
  );
}
