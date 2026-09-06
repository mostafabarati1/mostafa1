import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardsLoading, EmptyState, ErrorState, PageHeader } from "@/components/data-states";
import { formatNumber, formatPrice } from "@/lib/format";
import { rpc } from "@/lib/supabase-rpc";
import type { CatalogTree, PublicExam } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/exams")({
  head: () => ({
    meta: [
      { title: "آزمون‌ها | همراه استخدام" },
      { name: "description", content: "فهرست آزمون‌های آنلاین استخدامی بانک‌ها و سازمان‌ها" },
      { property: "og:title", content: "آزمون‌ها | همراه استخدام" },
      { property: "og:description", content: "فهرست آزمون‌های آنلاین استخدامی" },
    ],
  }),
  component: ExamsPage,
});

function ExamsPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [orgId, setOrgId] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PublicExam[]>([]);

  const catalogQuery = useQuery({
    queryKey: ["catalog"],
    queryFn: () => rpc<CatalogTree>("exam_catalog_tree"),
  });

  const listQuery = useQuery({
    queryKey: ["exams", debounced, categoryId, orgId, year, page],
    queryFn: async () => {
      const data = await rpc<{ items: PublicExam[]; total: number }>("list_exams_public", {
        p_search: debounced || null,
        p_category_id: categoryId || null,
        p_organization_id: orgId || null,
        p_year: year ? Number(year) : null,
        p_page: page,
        p_page_size: 12,
      });
      setItems((prev) => (page === 1 ? data.items : [...prev, ...data.items]));
      return data;
    },
  });

  const catalog = catalogQuery.data;
  const data = listQuery.data;
  const hasMore = items.length < (data?.total ?? 0);

  return (
    <div>
      <PageHeader title="آزمون‌ها" description="آزمون‌های آنلاین استخدامی بانک‌ها و سازمان‌ها" />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="ps-9"
            placeholder="جستجوی آزمون…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
              setDebounced(e.target.value);
            }}
          />
        </div>
        <Select
          value={categoryId}
          onValueChange={(v) => {
            setCategoryId(v);
            setPage(1);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="همه دسته‌ها" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">همه دسته‌ها</SelectItem>
            {catalog?.categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={orgId}
          onValueChange={(v) => {
            setOrgId(v);
            setPage(1);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="همه سازمان‌ها" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">همه سازمان‌ها</SelectItem>
            {catalog?.organizations.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {catalog && catalog.years.length > 0 && (
        <div className="mb-5">
          <Select
            value={year}
            onValueChange={(v) => {
              setYear(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="همه سال‌ها" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">همه سال‌ها</SelectItem>
              {catalog.years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {formatNumber(y)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {listQuery.isLoading && items.length === 0 ? (
        <CardsLoading />
      ) : listQuery.isError ? (
        <ErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title="آزمونی یافت نشد"
          description="با تغییر فیلترها یا جستجو دوباره تلاش کنید."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((exam) => (
              <Card key={exam.id} className="flex flex-col transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {exam.organization_name && <span>{exam.organization_name}</span>}
                    {exam.year && <span>· {formatNumber(exam.year)}</span>}
                    {exam.category_name && <span>· {exam.category_name}</span>}
                  </div>
                  <CardTitle className="text-base leading-7">{exam.title}</CardTitle>
                  {exam.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{exam.description}</p>
                  )}
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Timer className="size-3.5" />
                      {formatNumber(exam.duration_minutes)} دقیقه
                    </span>
                    <span>{formatNumber(exam.question_count)} سوال</span>
                    {exam.level && <span>سطح: {exam.level}</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-primary">
                      {exam.is_free ? "رایگان" : "ویژه اشتراک"}
                    </span>
                    <Button asChild size="sm">
                      <Link to="/exam/$slug" params={{ slug: exam.slug }}>
                        جزئیات و شروع
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {hasMore && (
            <div className="mt-6 text-center">
              <Button variant="outline" onClick={() => setPage((p) => p + 1)}>
                نمایش بیشتر
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
