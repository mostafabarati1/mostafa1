import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/data-states";
import { DataTable, type Column } from "@/components/admin/data-table";
import { UserRowActions } from "@/components/admin/user-row-actions";
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
import { adminUsersQuery, type AdminUserRow } from "@/lib/admin/queries";
import { formatDate } from "@/lib/format";

type SearchParams = {
  q?: string | undefined;
  role?: "admin" | "candidate" | undefined;
  sub?: "active" | "none" | undefined;
  status?: "active" | "suspended" | undefined;
  page?: number | undefined;
};

const searchSchema = z.object({
  q: z.string().optional(),
  role: z.enum(["admin", "candidate"]).optional(),
  sub: z.enum(["active", "none"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  page: z.number().int().min(1).optional(),
});

export const Route = createFileRoute("/admin/users/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "مدیریت کاربران | همراه استخدام" },
      {
        name: "description",
        content: "جست‌وجو، فیلتر و بررسی کاربران سامانه همراه استخدام.",
      },
      { property: "og:title", content: "مدیریت کاربران | همراه استخدام" },
      { property: "og:description", content: "جست‌وجو، فیلتر و بررسی کاربران سامانه." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [q, setQ] = useState(search.q ?? "");

  const page = search.page ?? 1;
  const query = useQuery({
    ...adminUsersQuery({
      search: q,
      role: search.role ?? null,
      hasActiveSub: search.sub ? search.sub === "active" : null,
      status: search.status ?? null,
      page,
      pageSize: 25,
    }),
    placeholderData: keepPreviousData,
  });

  const setSearch = (next: Partial<z.infer<typeof searchSchema>>) => {
    void navigate({ search: (prev: SearchParams) => ({ ...prev, page: 1, ...next }) });
  };

  const columns: Column<AdminUserRow>[] = [
    {
      key: "name",
      header: "کاربر",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.full_name ?? "بی‌نام"}</p>
          <p className="truncate text-xs text-muted-foreground">{r.email ?? r.mobile ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "نقش",
      cell: (r) => (
        <Badge variant={r.role === "admin" ? "default" : "secondary"}>
          {r.role === "admin" ? "مدیر" : "کاربر"}
        </Badge>
      ),
    },
    {
      key: "sub",
      header: "اشتراک",
      cell: (r) =>
        r.has_active_sub ? (
          <div>
            <Badge>{r.sub_status === "trial" ? "آزمایشی" : "فعال"}</Badge>
            <p className="mt-1 text-xs text-muted-foreground">
              {r.plan_title ?? "—"} · تا {formatDate(r.sub_expires_at)}
            </p>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">بدون اشتراک</span>
        ),
    },
    {
      key: "status",
      header: "وضعیت",
      cell: (r) => (
        <Badge variant={r.status === "active" ? "secondary" : "destructive"}>
          {r.status === "active" ? "فعال" : r.status === "suspended" ? "مسدود" : (r.status ?? "—")}
        </Badge>
      ),
    },
    { key: "created", header: "تاریخ عضویت", cell: (r) => formatDate(r.created_at) },
    {
      key: "actions",
      header: "",
      cell: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/users/$id" params={{ id: r.id }}>
              <Eye className="size-4" />
              جزئیات
            </Link>
          </Button>
          <UserRowActions userId={r.id} fullName={r.full_name} role={r.role} status={r.status} />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="کاربران" description="مدیریت کاربران، نقش‌ها و اشتراک‌ها" />
      <DataTable
        columns={columns}
        rows={query.data?.items}
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        rowKey={(r) => r.id}
        emptyTitle="کاربری با این فیلترها یافت نشد"
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
            searchPlaceholder="نام، ایمیل یا موبایل…"
            filters={
              <>
                <Select
                  value={search.role ?? "all"}
                  onValueChange={(v) =>
                    setSearch({ role: v === "all" ? undefined : (v as "admin" | "candidate") })
                  }
                >
                  <SelectTrigger className="w-36" aria-label="نقش">
                    <SelectValue placeholder="نقش" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه نقش‌ها</SelectItem>
                    <SelectItem value="admin">مدیر</SelectItem>
                    <SelectItem value="candidate">کاربر</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={search.sub ?? "all"}
                  onValueChange={(v) =>
                    setSearch({ sub: v === "all" ? undefined : (v as "active" | "none") })
                  }
                >
                  <SelectTrigger className="w-40" aria-label="اشتراک">
                    <SelectValue placeholder="اشتراک" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه</SelectItem>
                    <SelectItem value="active">اشتراک فعال</SelectItem>
                    <SelectItem value="none">بدون اشتراک</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={search.status ?? "all"}
                  onValueChange={(v) =>
                    setSearch({ status: v === "all" ? undefined : (v as "active" | "suspended") })
                  }
                >
                  <SelectTrigger className="w-36" aria-label="وضعیت حساب">
                    <SelectValue placeholder="وضعیت حساب" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                    <SelectItem value="active">فعال</SelectItem>
                    <SelectItem value="suspended">مسدود</SelectItem>
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
