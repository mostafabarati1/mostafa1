import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CalendarDays, Newspaper } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { formatDate } from "@/lib/format";
import { listPublicNews } from "@/lib/newsletter/news-public.functions";

export function DashboardNews({ limit = 4 }: { limit?: number }) {
  const fetchNews = useServerFn(listPublicNews);

  const query = useQuery({
    queryKey: ["news", "dashboard", limit],
    queryFn: () => fetchNews({ data: { page: 1, pageSize: limit } }),
    staleTime: 5 * 60_000,
  });

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Newspaper className="size-4 text-primary" />
          اخبار استخدام
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/news">
            همه اخبار
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <LoadingState rows={3} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (query.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title="خبری برای نمایش نیست"
            description="به‌محض انتشار اطلاعیه‌های استخدامی، همین‌جا نمایش داده می‌شود."
          />
        ) : (
          <ul className="divide-y">
            {query.data?.items.map((item) => {
              const content = (
                <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.title}</p>
                    {item.summary ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {item.summary}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.is_important ? <Badge>مهم</Badge> : null}
                    {item.category_name ? (
                      <Badge variant="secondary">{item.category_name}</Badge>
                    ) : null}
                    {item.published_at ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="size-3.5" />
                        {formatDate(item.published_at)}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
              return (
                <li key={item.id}>
                  {item.slug ? (
                    <Link
                      to="/news/$slug"
                      params={{ slug: item.slug }}
                      className="block rounded-lg px-1 transition-colors hover:bg-accent/50"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="px-1">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
