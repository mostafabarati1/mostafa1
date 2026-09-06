import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/data-states";
import { DataTable, type Column } from "@/components/admin/data-table";
import { ExamRowActions } from "@/components/admin/exam-row-actions";
import { PageToolbar } from "@/components/admin/page-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminExamsQuery, type AdminExamRow } from "@/lib/admin/queries";
import { formatDate, formatNumber } from "@/lib/format";

type SearchParams = {
  q?: string | undefined;
  status?: "draft" | "published" | "archived" | undefined;
  access?: "public" | "private" | "invitation_only" | undefined;
  page?: number | undefined;
};

const searchSchema = z.object({
  q: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  access: z.enum(["public", "private", "invitation_only"]).optional(),
  page: z.number().int().min(1).optional(),
});

const STATUS_LABEL: Record<string, string> = {
  draft: "پیش‌نویس",
  published: "منتشرشده",
  archived: "بایگانی",
};

const ACCESS_LABEL: Record<string, string> = {
  public: "عمومی",
  private: "خصوصی",
  invitation_only: "فقط با دعوت",
};

export const Route = createFileRoute("/admin/exams/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "مدیریت آزمون‌ها | همراه استخدام" },
      {
        name: "description",
        content: "فهرست آزمون‌ها با فیلتر وضعیت انتشار، نوع دسترسی و صفحه‌بندی.",
      },
      { property: "og:title", content: "مدیریت آزمون‌ها | همراه استخدام" },
      {
        property: "og:description",
        content: "فهرست آزمون‌ها با فیلتر وضعیت انتشار و نوع دسترسی.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminExamsPage,
});

function AdminExamsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [q, setQ] = useState(search.q ?? "");

  const page = search.page ?? 1;
  const query = useQuery({
    ...adminExamsQuery({
      search: q,
      status: search.status ?? null,
      accessType: search.access ?? null,
      page,
      pageSize: 25,
    }),
    placeholderData: keepPreviousData,
  });

  const setSearch = (next: Partial<z.infer<typeof searchSchema>>) => {
    void navigate({ search: (prev: SearchParams) => ({ ...prev, page: 1, ...next }) });
  };

  const columns: Column<AdminExamRow>[] = [
    {
      key: "title",
      header: "آزمون",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {r.category_name ?? "بدون دسته"}
            {r.organization_name ? ` · ${r.organization_name}` : ""}
            {r.year ? ` · ${formatNumber(r.year)}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "وضعیت",
      cell: (r) => (
        <Badge variant={r.status === "published" ? "default" : "secondary"}>
          {STATUS_LABEL[r.status] ?? r.status}
        </Badge>
      ),
    },
    {
      key: "access",
      header: "دسترسی",
      cell: (r) => (
        <div>
          <Badge variant="outline">{ACCESS_LABEL[r.access_type] ?? r.access_type}</Badge>
          {!r.is_free && r.price > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">{formatNumber(r.price)} تومان</p>
          )}
        </div>
      ),
    },
    {
      key: "questions",
      header: "سوال",
      cell: (r) => formatNumber(r.question_count),
    },
    {
      key: "attempts",
      header: "شرکت",
      cell: (r) => formatNumber(r.attempt_count),
    },
    {
      key: "duration",
      header: "مدت",
      cell: (r) => `${formatNumber(r.duration_minutes)} دقیقه`,
    },
    { key: "updated", header: "آخرین ویرایش", cell: (r) => formatDate(r.updated_at) },
    {
      key: "actions",
      header: "",
      cell: (r) => <ExamRowActions examId={r.id} title={r.title} status={r.status} slug={r.slug} />,
    },
  ];

  return (
    <>
      <PageHeader title="آزمون‌ها" description="مدیریت آزمون‌ها، وضعیت انتشار و نوع دسترسی" />
      <DataTable
        columns={columns}
        rows={query.data?.items}
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        rowKey={(r) => r.id}
        emptyTitle="آزمونی با این فیلترها یافت نشد"
        page={page}
        pageSize={query.data?.page_size ?? 25}
        total={query.data?.total ?? 0}
        onPageChange={(p) =>
          void navigate({ search: (prev: SearchParams) => ({ ...prev, page: p }) })
        }
        toolbar={
          <PageToolbar
            search={q}
            onSearchChange={(v) => {
              setQ(v);
              setSearch({ q: v || undefined });
            }}
            searchPlaceholder="عنوان یا نشانی آزمون…"
            actions={
              <Button asChild size="sm">
                <Link to="/admin/exams/new">
                  <Plus className="size-4" />
                  آزمون جدید
                </Link>
              </Button>
            }
            filters={
              <>
                <Select
                  value={search.status ?? "all"}
                  onValueChange={(v) =>
                    setSearch({
                      status: v === "all" ? undefined : (v as "draft" | "published" | "archived"),
                    })
                  }
                >
                  <SelectTrigger className="w-40" aria-label="وضعیت انتشار">
                    <SelectValue placeholder="وضعیت" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                    <SelectItem value="published">منتشرشده</SelectItem>
                    <SelectItem value="draft">پیش‌نویس</SelectItem>
                    <SelectItem value="archived">بایگانی</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={search.access ?? "all"}
                  onValueChange={(v) =>
                    setSearch({
                      access:
                        v === "all" ? undefined : (v as "public" | "private" | "invitation_only"),
                    })
                  }
                >
                  <SelectTrigger className="w-40" aria-label="نوع دسترسی">
                    <SelectValue placeholder="دسترسی" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه دسترسی‌ها</SelectItem>
                    <SelectItem value="public">عمومی</SelectItem>
                    <SelectItem value="private">خصوصی</SelectItem>
                    <SelectItem value="invitation_only">فقط با دعوت</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
          />
        }
      />
    </>
  );
}
