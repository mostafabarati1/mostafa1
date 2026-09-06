import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Search, Settings2 } from "lucide-react";

import {
  NewsletterEmpty,
  NewsletterError,
  NewsletterLoading,
  NewsletterPage,
} from "@/components/newsletter/newsletter-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { listNewsCategories, listPublicNews } from "@/lib/newsletter/news-public.functions";

type Search = { q?: string | undefined; category?: string | undefined; page?: number | undefined };

export const Route = createFileRoute("/news/")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    q: typeof search["q"] === "string" && search["q"] ? search["q"].slice(0, 120) : undefined,
    category: typeof search["category"] === "string" ? search["category"] : undefined,
    page: Number(search["page"]) > 1 ? Number(search["page"]) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "اخبار و اطلاعیه‌های استخدامی | همراه استخدام" },
      {
        name: "description",
        content:
          "تازه‌ترین اخبار و اطلاعیه‌های آزمون‌های استخدامی: انتشار آگهی، تمدید مهلت ثبت‌نام، کارت ورود به جلسه و اعلام نتایج.",
      },
      { property: "og:title", content: "اخبار و اطلاعیه‌های استخدامی" },
      {
        property: "og:description",
        content: "تازه‌ترین اطلاعیه‌های آزمون‌های استخدامی در همراه استخدام.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewsPage,
});

const PAGE_SIZE = 12;

function NewsPage() {
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();
  const fetchNews = useServerFn(listPublicNews);
  const fetchCategories = useServerFn(listNewsCategories);
  const [term, setTerm] = useState(searchParams.q ?? "");

  const page = searchParams.page ?? 1;

  const query = useQuery({
    queryKey: ["news", "public", searchParams.q ?? "", searchParams.category ?? "", page],
    queryFn: () =>
      fetchNews({
        data: {
          ...(searchParams.q ? { q: searchParams.q } : {}),
          ...(searchParams.category ? { categoryId: searchParams.category } : {}),
          page,
          pageSize: PAGE_SIZE,
        },
      }),
  });

  const categoriesQuery = useQuery({
    queryKey: ["news", "categories"],
    queryFn: () => fetchCategories(),
    staleTime: 5 * 60_000,
  });

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1;

  return (
    <NewsletterPage
      title="اخبار و اطلاعیه‌های استخدامی"
      description="آگهی‌های جدید، تمدید مهلت‌ها، کارت ورود به جلسه و اعلام نتایج — همه در یک جا."
      actions={
        <Button variant="outline" asChild>
          <Link to="/newsletter/manage">
            <Settings2 aria-hidden /> تنظیم اعلان‌های من
          </Link>
        </Button>
      }
    >
      <form
        className="mb-5 flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void navigate({
            search: {
              ...(term.trim() ? { q: term.trim() } : {}),
              ...(searchParams.category ? { category: searchParams.category } : {}),
            },
          });
        }}
      >
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="جستجو در اخبار"
          aria-label="جستجو در اخبار"
        />
        <Button type="submit" variant="secondary">
          <Search aria-hidden /> جستجو
        </Button>
      </form>

      {(categoriesQuery.data ?? []).length > 0 && (
        <nav aria-label="دسته‌بندی اخبار" className="mb-6 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={searchParams.category ? "outline" : "default"}
            onClick={() =>
              void navigate({ search: { ...(searchParams.q ? { q: searchParams.q } : {}) } })
            }
          >
            همه
          </Button>
          {(categoriesQuery.data ?? []).map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant={searchParams.category === c.id ? "default" : "outline"}
              onClick={() =>
                void navigate({
                  search: {
                    ...(searchParams.q ? { q: searchParams.q } : {}),
                    category: c.id,
                  },
                })
              }
            >
              {c.name}
            </Button>
          ))}
        </nav>
      )}

      {query.isPending ? (
        <NewsletterLoading />
      ) : query.error ? (
        <NewsletterError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <NewsletterEmpty
          title="خبری یافت نشد"
          description="فیلترها را تغییر دهید یا بعداً دوباره سر بزنید."
        />
      ) : (
        <>
          <ul className="grid gap-4">
            {query.data.items.map((item) => (
              <li
                key={item.id}
                className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {item.is_important && <Badge variant="destructive">مهم</Badge>}
                  {item.category_name && <Badge variant="secondary">{item.category_name}</Badge>}
                </div>
                <h2 className="mt-2 text-base font-semibold text-card-foreground">
                  {item.slug ? (
                    <Link
                      to="/news/$slug"
                      params={{ slug: item.slug }}
                      className="hover:text-primary"
                    >
                      {item.title}
                    </Link>
                  ) : (
                    item.title
                  )}
                </h2>
                {item.summary && (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.summary}</p>
                )}
                <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" aria-hidden />
                  {formatDate(item.published_at)}
                </p>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() =>
                  void navigate({
                    search: {
                      ...(searchParams.q ? { q: searchParams.q } : {}),
                      ...(searchParams.category ? { category: searchParams.category } : {}),
                      ...(page - 1 > 1 ? { page: page - 1 } : {}),
                    },
                  })
                }
              >
                قبلی
              </Button>
              <span className="text-sm text-muted-foreground">
                صفحه {page} از {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() =>
                  void navigate({
                    search: {
                      ...(searchParams.q ? { q: searchParams.q } : {}),
                      ...(searchParams.category ? { category: searchParams.category } : {}),
                      page: page + 1,
                    },
                  })
                }
              >
                بعدی
              </Button>
            </div>
          )}
        </>
      )}
    </NewsletterPage>
  );
}
