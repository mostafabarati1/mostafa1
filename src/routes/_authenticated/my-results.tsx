import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye, FileQuestion } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState, EmptyState, ErrorState, PageHeader } from "@/components/data-states";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/my-results")({
  head: () => ({
    meta: [
      { title: "نتایج من | همراه استخدام" },
      { name: "description", content: "نتایج آزمون‌های شما" },
    ],
  }),
  component: MyResultsPage,
});

type Row = {
  id: string;
  status: string;
  passed: boolean | null;
  earned_score: number | null;
  total_score: number | null;
  submitted_at: string | null;
  created_at: string;
  exam: { id: string; title: string; slug: string } | null;
};

function MyResultsPage() {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const query = useQuery({
    queryKey: ["my-results", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_attempts")
        .select(
          "id, status, passed, earned_score, total_score, submitted_at, created_at, exam:exams(id,title,slug)",
        )
        .eq("candidate_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const rows = query.data ?? [];

  return (
    <div>
      <PageHeader title="نتایج من" description="نتایج آزمون‌های شما" />

      {query.isLoading ? (
        <LoadingState rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileQuestion className="size-8" />}
          title="هنوز نتیجه‌ای ندارید"
          description="با شرکت در اولین آزمون، نتیجه شما اینجا نمایش داده می‌شود."
          action={
            <Button asChild size="sm">
              <Link to="/exams">مشاهده آزمون‌ها</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const pct = r.total_score
              ? Math.round(((r.earned_score ?? 0) / r.total_score) * 100)
              : 0;
            return (
              <Card key={r.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.exam?.title ?? "—"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.status === "graded"
                        ? formatDate(r.submitted_at ?? r.created_at)
                        : formatDate(r.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.status === "graded" && r.passed != null && (
                      <Badge variant={r.passed ? "default" : "secondary"}>
                        {r.passed ? "قبول" : "ناموفق"}
                      </Badge>
                    )}
                    {r.status === "graded" && (
                      <span className="text-sm font-semibold">{formatPercent(pct / 100)}</span>
                    )}
                    {r.status === "in_progress" && <Badge variant="outline">در حال انجام</Badge>}
                    {r.exam && r.status === "graded" && (
                      <Button asChild size="sm" variant="outline">
                        <Link
                          to="/exam/$slug/result"
                          params={{ slug: r.exam.slug }}
                          search={{ attemptId: r.id }}
                        >
                          <Eye className="size-4" />
                          کارنامه
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
