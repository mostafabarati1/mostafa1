import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ArrowLeft, BarChart3, CheckCircle2, ClipboardList, CreditCard } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState, EmptyState, ErrorState, PageHeader } from "@/components/data-states";
import { DashboardNews } from "@/components/dashboard-news";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import { rpc } from "@/lib/supabase-rpc";
import type { MySubscription } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "داشبورد | همراه استخدام" },
      { name: "description", content: "نمای کلی فعالیت‌ها و آزمون‌های شما" },
      { property: "og:title", content: "داشبورد | همراه استخدام" },
      { property: "og:description", content: "نمای کلی فعالیت‌ها و آزمون‌های شما" },
    ],
  }),
  component: DashboardPage,
});

type AttemptRow = {
  id: string;
  status: string;
  passed: boolean | null;
  earned_score: number | null;
  total_score: number | null;
  correct_count: number | null;
  created_at: string;
  exam: { id: string; title: string; slug: string } | null;
};

function DashboardPage() {
  const { user, displayName } = useAuth();
  const userId = user?.id ?? "";

  const subQuery = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => rpc<MySubscription>("my_subscription"),
  });

  const attemptsQuery = useQuery({
    queryKey: ["my-attempts", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_attempts")
        .select(
          "id, status, passed, earned_score, total_score, correct_count, created_at, exam:exams(id,title,slug)",
        )
        .eq("candidate_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as AttemptRow[];
    },
  });

  const stats = useMemo(() => {
    const attempts = attemptsQuery.data ?? [];
    const total = attempts.length;
    const passed = attempts.filter((a) => a.passed).length;
    const avg = total
      ? Math.round(
          attempts.reduce((sum, a) => {
            if (a.total_score == null || a.earned_score == null) return sum;
            return sum + (a.total_score ? (a.earned_score / a.total_score) * 100 : 0);
          }, 0) / total,
        )
      : 0;
    return { total, passed, avg };
  }, [attemptsQuery.data]);

  const hasActive = subQuery.data?.has_active ?? false;

  return (
    <div>
      <PageHeader
        title={`خوش آمدید${displayName ? "، " + displayName : ""}`}
        description="نمای کلی فعالیت‌ها و آزمون‌های شما"
        actions={
          <Button asChild>
            <Link to="/exams">
              مشاهده آزمون‌ها
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<ClipboardList className="size-5" />}
          label="شرکت در آزمون"
          value={attemptsQuery.isLoading ? "—" : formatNumber(stats.total)}
        />
        <StatCard
          icon={<CheckCircle2 className="size-5" />}
          label="قبول‌شده"
          value={attemptsQuery.isLoading ? "—" : formatNumber(stats.passed)}
        />
        <StatCard
          icon={<BarChart3 className="size-5" />}
          label="میانگین درصد"
          value={attemptsQuery.isLoading ? "—" : formatPercent(stats.avg / 100)}
        />
        <StatCard
          icon={<CreditCard className="size-5" />}
          label="اشتراک"
          value={subQuery.isLoading ? "—" : hasActive ? "فعال" : "ندارید"}
        />
      </div>

      <Card className="mt-6 border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div>
            <CardTitle className="text-base">تمرین سوالات با پاسخ تشریحی هوش مصنوعی</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              درس‌های موردنظر را انتخاب کنید، آزمون تمرینی بسازید و پاسخ تشریحی کامل هر سوال را
              ببینید.
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link to="/practice">شروع تمرین</Link>
          </Button>
        </CardContent>
      </Card>

      <DashboardNews />

      <div className="mt-6">
        <h2 className="mb-3 text-lg font-bold">آزمون‌های اخیر</h2>
        {attemptsQuery.isLoading ? (
          <LoadingState rows={3} />
        ) : attemptsQuery.isError ? (
          <ErrorState error={attemptsQuery.error} onRetry={() => void attemptsQuery.refetch()} />
        ) : stats.total === 0 ? (
          <EmptyState
            title="هنوز در آزمونی شرکت نکرده‌اید"
            description="از بخش آزمون‌ها اولین آزمون را شروع کنید."
            action={
              <Button asChild size="sm">
                <Link to="/exams">مشاهده آزمون‌ها</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {attemptsQuery.data?.map((a) => (
              <Card key={a.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.exam?.title ?? "—"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(a.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {a.passed != null && (
                      <Badge variant={a.passed ? "default" : "secondary"}>
                        {a.passed ? "قبول" : "ناموفق"}
                      </Badge>
                    )}
                    {a.status === "graded" && a.total_score != null ? (
                      <span className="text-sm font-semibold">
                        {formatNumber(a.earned_score)} از {formatNumber(a.total_score)}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">{a.status}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {!hasActive && (
        <Card className="mt-6 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
            <div>
              <CardTitle className="text-base">
                با اشتراک، به همه آزمون‌ها دسترسی پیدا کنید
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                فعال‌سازی اشتراک، شرکت نامحدود در آزمون‌های سامانه را ممکن می‌کند.
              </p>
            </div>
            <Button asChild>
              <Link to="/subscription">مشاهده پلن‌ها</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
