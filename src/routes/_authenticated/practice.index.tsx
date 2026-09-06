import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GraduationCap, Loader2, Play, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CardsLoading, EmptyState, ErrorState, PageHeader } from "@/components/data-states";
import { humanizeError, formatNumber } from "@/lib/format";
import { practiceFiltersSchema } from "@/lib/practice.schema";
import { rpc } from "@/lib/supabase-rpc";
import type { CatalogTree, PublicExam } from "@/lib/types";

const ALL = "all";

export const Route = createFileRoute("/_authenticated/practice/")({
  head: () => ({
    meta: [
      { title: "آزمون تمرینی | همراه استخدام" },
      {
        name: "description",
        content:
          "با جستجو و فیلتر درختی دسته‌بندی، سازمان و سال، آزمون موردنظر را پیدا کنید، درس‌ها را انتخاب کنید و تمرین را شروع کنید.",
      },
      { property: "og:title", content: "آزمون تمرینی" },
      {
        property: "og:description",
        content: "جستجوی درختی آزمون‌ها و شروع آزمون تمرینی بر اساس درس‌های انتخابی.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PracticePage,
});

function PracticePage() {
  const navigate = useNavigate();
  const [examId, setExamId] = useState<string | null>(null);
  const [examSubjects, setExamSubjects] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>(ALL);
  const [orgId, setOrgId] = useState<string>(ALL);
  const [year, setYear] = useState<string>(ALL);

  const filtersQuery = useQuery({
    queryKey: ["practice-filters"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("practice_filters");
      if (error) throw error;
      return practiceFiltersSchema.parse(data);
    },
  });

  const catalogQuery = useQuery({
    queryKey: ["catalog"],
    queryFn: () => rpc<CatalogTree>("exam_catalog_tree"),
  });

  const listQuery = useQuery({
    queryKey: ["practice-exams", search, categoryId, orgId, year],
    queryFn: () =>
      rpc<{ items: PublicExam[]; total: number }>("list_exams_public", {
        p_search: search || null,
        p_category_id: categoryId === ALL ? null : categoryId,
        p_organization_id: orgId === ALL ? null : orgId,
        p_year: year === ALL ? null : Number(year),
        p_page: 1,
        p_page_size: 48,
      }),
  });

  const startSession = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("start_practice_session", {
        ...(examSubjects.length ? { p_subject_ids: examSubjects } : {}),
        ...(examId ? { p_exam_id: examId } : {}),
        p_count: 60,
      });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: (sessionId) => {
      void navigate({ to: "/practice/$sessionId", params: { sessionId } });
    },
  });

  const filters = filtersQuery.data;
  const catalog = catalogQuery.data;

  /** Categories rendered as a two-level tree (parent → children). */
  const categoryTree = useMemo(() => {
    const cats = catalog?.categories ?? [];
    const roots = cats.filter((c) => !c.parent_id);
    return roots.flatMap((root) => [
      { ...root, depth: 0 },
      ...cats.filter((c) => c.parent_id === root.id).map((c) => ({ ...c, depth: 1 })),
    ]);
  }, [catalog]);

  /** Practice metadata (subject ids) for exams returned by the catalog search. */
  const practiceExams = useMemo(() => {
    const byId = new Map((filters?.exams ?? []).map((e) => [e.id, e]));
    return (listQuery.data?.items ?? [])
      .map((e) => ({ exam: e, practice: byId.get(e.id) }))
      .filter((x): x is { exam: PublicExam; practice: NonNullable<typeof x.practice> } =>
        Boolean(x.practice),
      );
  }, [filters, listQuery.data]);

  const selected = practiceExams.find((x) => x.exam.id === examId) ?? null;
  const subjects = selected
    ? (filters?.subjects ?? []).filter((s) => selected.practice.subject_ids.includes(s.id))
    : [];

  const isLoading = filtersQuery.isLoading || listQuery.isLoading;
  const error = filtersQuery.error ?? listQuery.error;

  return (
    <div>
      <PageHeader
        title="آزمون تمرینی"
        description="با جستجو و فیلترهای درختی، آزمون موردنظر را پیدا کنید، درس‌ها را انتخاب کنید و تمرین را شروع کنید."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="ps-9"
            placeholder="جستجوی آزمون…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setExamId(null);
            }}
          />
        </div>
        <Select
          value={categoryId}
          onValueChange={(v) => {
            setCategoryId(v);
            setExamId(null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="همه دسته‌ها" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>همه دسته‌ها</SelectItem>
            {categoryTree.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span style={{ paddingInlineStart: c.depth * 14 }}>
                  {c.depth > 0 ? "— " : ""}
                  {c.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={orgId}
          onValueChange={(v) => {
            setOrgId(v);
            setExamId(null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="همه سازمان‌ها" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>همه سازمان‌ها</SelectItem>
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
              setExamId(null);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="همه سال‌ها" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>همه سال‌ها</SelectItem>
              {catalog.years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {formatNumber(y)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <CardsLoading />
      ) : error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void filtersQuery.refetch();
            void listQuery.refetch();
          }}
        />
      ) : practiceExams.length === 0 ? (
        <EmptyState
          title="آزمونی یافت نشد"
          description="با تغییر جستجو یا فیلترها دوباره تلاش کنید."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {practiceExams.map(({ exam, practice }) => {
            const active = examId === exam.id;
            return (
              <Card
                key={exam.id}
                className={`flex flex-col transition-shadow hover:shadow-md ${
                  active ? "border-primary" : ""
                }`}
              >
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {exam.organization_name && <span>{exam.organization_name}</span>}
                    {exam.year && <span>· {formatNumber(exam.year)}</span>}
                    {exam.category_name && <span>· {exam.category_name}</span>}
                  </div>
                  <CardTitle className="flex items-center gap-2 text-base leading-7">
                    <GraduationCap className="size-4 text-primary" />
                    {exam.title}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(practice.subject_ids.length)} درس
                  </p>
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  {!active ? (
                    <Button
                      className="w-full"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setExamId(exam.id);
                        setExamSubjects([]);
                      }}
                    >
                      انتخاب درس‌ها و شروع
                    </Button>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {subjects.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            برای این آزمون درسی ثبت نشده است.
                          </p>
                        ) : (
                          subjects.map((s) => (
                            <label
                              key={s.id}
                              className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
                            >
                              <Checkbox
                                checked={examSubjects.includes(s.id)}
                                onCheckedChange={(v) =>
                                  setExamSubjects((prev) =>
                                    v === true ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                                  )
                                }
                              />
                              {s.name}
                            </label>
                          ))
                        )}
                      </div>
                      <Button
                        className="w-full"
                        size="sm"
                        disabled={startSession.isPending}
                        onClick={() => startSession.mutate()}
                      >
                        {startSession.isPending ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            در حال آماده‌سازی…
                          </>
                        ) : (
                          <>
                            <Play className="size-4" />
                            شروع آزمون تمرینی
                          </>
                        )}
                      </Button>
                      {startSession.isError && (
                        <p role="alert" className="text-sm text-destructive">
                          {humanizeError(startSession.error)}
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
