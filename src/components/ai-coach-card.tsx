import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getCoachEligibility } from "@/lib/ai-coach-access.functions";
import { Lock } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Target, TrendingUp, BookOpen, ExternalLink, ListChecks } from "lucide-react";
import { getCoachAnalysis } from "@/lib/ai-coach.functions";
import { lazy, Suspense } from "react";
import { LEVEL_LABELS_FA, type CoachResult } from "@/lib/ai-coach.schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { humanizeError } from "@/lib/format";

// نمودارها (recharts) فقط پس از تولید تحلیل بارگذاری می‌شوند تا باندل اولیه سبک بماند.
const PerformanceTrendChart = lazy(() =>
  import("@/components/ai-coach-charts").then((m) => ({ default: m.PerformanceTrendChart })),
);
const SubjectComparisonChart = lazy(() =>
  import("@/components/ai-coach-charts").then((m) => ({ default: m.SubjectComparisonChart })),
);

export function AiCoachCard({ compact = false }: { compact?: boolean }) {
  const run = useServerFn(getCoachAnalysis);
  const checkAccess = useServerFn(getCoachEligibility);
  const queryClient = useQueryClient();

  const access = useQuery({
    queryKey: ["ai-coach-eligibility"],
    queryFn: () => checkAccess({ data: undefined }),
  });

  const mutation = useMutation<CoachResult>({
    mutationFn: () => run({ data: {} }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["ai-coach-eligibility"] });
      void queryClient.invalidateQueries({ queryKey: ["ai-coach-history"] });
    },
  });

  const result = mutation.data;
  const blocked = access.data && !access.data.allowed ? access.data : null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-5 text-primary" />
          مربی هوشمند مطالعه
        </CardTitle>
        <Button
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || access.isLoading || !!blocked}
        >
          {mutation.isPending ? "در حال تحلیل…" : result ? "تحلیل مجدد" : "تحلیل کارنامه من"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {blocked && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-card p-3 text-sm">
            <Lock className="size-4 shrink-0 text-primary" />
            <span className="text-muted-foreground">{blocked.message}</span>
            {blocked.code === "no_subscription" && (
              <Button asChild size="sm" variant="secondary">
                <Link to="/subscription">خرید اشتراک</Link>
              </Button>
            )}
            {blocked.code === "no_attempt" && (
              <Button asChild size="sm" variant="secondary">
                <Link to="/exams">شروع آزمون</Link>
              </Button>
            )}
          </div>
        )}
        {mutation.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : mutation.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {humanizeError(mutation.error)}
          </p>
        ) : !result ? (
          <p className="text-sm text-muted-foreground">
            با یک کلیک، بر اساس داده‌های واقعی آزمون‌های شما نقاط قوت و ضعف، برنامه مطالعه و منابع
            پیشنهادی به‌صورت فارسی تولید می‌شود.
          </p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-foreground">{result.analysis.headline}</h3>
                <Badge variant="secondary">{LEVEL_LABELS_FA[result.analysis.level]}</Badge>
                {result.has_previous_report && (
                  <Badge variant="outline">به‌روزشده پس از آزمون اخیر</Badge>
                )}
              </div>
              <p className="text-sm leading-7 text-muted-foreground">{result.analysis.summary}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Stat
                label="آزمون‌های ثبت‌شده"
                value={formatNumber(result.analytics.performance.attempts_total)}
              />
              <Stat
                label="میانگین درصد"
                value={
                  result.analytics.performance.avg_percent == null
                    ? "—"
                    : `${formatNumber(result.analytics.performance.avg_percent, 1)}٪`
                }
              />
              <Stat
                label="پاسخ‌های بررسی‌شده"
                value={formatNumber(result.analytics.performance.answered_total)}
              />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <Suspense fallback={<Skeleton className="h-56 w-full rounded-xl" />}>
                <PerformanceTrendChart analytics={result.analytics} />
                <SubjectComparisonChart analytics={result.analytics} />
              </Suspense>
            </div>

            {result.analysis.strengths.length > 0 && (
              <Section icon={<TrendingUp className="size-4 text-primary" />} title="نقاط قوت">
                <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {result.analysis.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </Section>
            )}

            {result.analysis.weaknesses.length > 0 && (
              <Section icon={<Target className="size-4 text-primary" />} title="نقاط قابل بهبود">
                <ul className="space-y-2">
                  {result.analysis.weaknesses.map((w, i) => (
                    <li key={i} className="rounded-xl border bg-card p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{w.topic}</span>
                        {w.correct_rate != null && (
                          <Badge variant="outline">
                            {formatNumber(w.correct_rate, 1)}٪ پاسخ صحیح
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-muted-foreground">{w.reason}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {!compact && result.analysis.study_plan.length > 0 && (
              <Section
                icon={<ListChecks className="size-4 text-primary" />}
                title="برنامه مطالعه پیشنهادی"
              >
                <ol className="space-y-2">
                  {result.analysis.study_plan.map((p, i) => (
                    <li key={i} className="rounded-xl border bg-card p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{p.title}</span>
                        <Badge variant="secondary">{formatNumber(p.estimated_minutes)} دقیقه</Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">{p.focus}</p>
                      <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                        {p.actions.map((a, j) => (
                          <li key={j}>{a}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            {result.analysis.recommended_resources.length > 0 && (
              <Section icon={<BookOpen className="size-4 text-primary" />} title="منابع پیشنهادی">
                <ul className="space-y-2">
                  {result.analysis.recommended_resources.map((r) => {
                    const source = result.resources.find((x) => x.id === r.id);
                    return (
                      <li key={r.id} className="rounded-xl border bg-card p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">
                            {source?.title ?? r.title}
                          </span>
                          {source?.url && (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              مشاهده <ExternalLink className="size-3.5" />
                            </a>
                          )}
                        </div>
                        <p className="mt-1 text-muted-foreground">{r.why}</p>
                      </li>
                    );
                  })}
                </ul>
              </Section>
            )}

            {result.analysis.next_steps.length > 0 && (
              <Section title="گام‌های بعدی">
                <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {result.analysis.next_steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </Section>
            )}

            <p className="rounded-xl bg-card p-3 text-sm leading-7 text-foreground">
              {result.analysis.motivation}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-bold text-foreground">{value}</p>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </h4>
      {children}
    </div>
  );
}
