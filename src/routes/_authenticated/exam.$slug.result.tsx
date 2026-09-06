import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, MinusCircle, ArrowLeft, Award, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState, ErrorState, PageHeader } from "@/components/data-states";
import { AiCoachCard } from "@/components/ai-coach-card";
import { formatNumber, formatPercent } from "@/lib/format";
import { rpc } from "@/lib/supabase-rpc";
import { OptionImage } from "@/components/option-image";
import { cn } from "@/lib/utils";
import type { AttemptReview } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/exam/$slug/result")({
  validateSearch: (s: Record<string, unknown>) => ({
    attemptId: typeof s["attemptId"] === "string" ? s["attemptId"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "نتیجه آزمون | همراه استخدام" },
      { name: "description", content: "نتیجه و کارنامه آزمون استخدامی" },
    ],
  }),
  component: ResultPage,
});

function ResultPage() {
  const { slug } = Route.useParams();
  const { attemptId } = Route.useSearch();

  const query = useQuery({
    queryKey: ["attempt-review", attemptId],
    enabled: !!attemptId,
    queryFn: () => rpc<AttemptReview>("get_attempt_review", { p_attempt_id: attemptId }),
  });

  if (query.isLoading) return <LoadingState rows={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const review = query.data;
  if (!review)
    return <ErrorState error="نتیجه‌ای یافت نشد." onRetry={() => void query.refetch()} />;

  const a = review.attempt;
  const percentage = a.total_score ? Math.round(((a.earned_score ?? 0) / a.total_score) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="نتیجه آزمون"
        description={review.exam.title}
        actions={
          <Button asChild variant="outline">
            <Link to="/exams">
              <ArrowLeft className="size-4" />
              بازگشت به آزمون‌ها
            </Link>
          </Button>
        }
      />

      <Card className={cn("mb-6", a.passed ? "border-emerald-500/40" : "border-destructive/40")}>
        <CardContent className="py-6 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Award className="size-8" />
          </div>
          <Badge variant={a.passed ? "default" : "destructive"} className="mb-3">
            {a.passed ? "قبول" : "ناموفق"}
          </Badge>
          <p className="text-3xl font-extrabold">{formatPercent(percentage / 100)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            نمره کسب‌شده: {formatNumber(a.earned_score)} از {formatNumber(a.total_score)}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                <CheckCircle2 className="size-4" /> {formatNumber(a.correct_count)}
              </p>
              <p className="text-xs text-muted-foreground">صحیح</p>
            </div>
            <div>
              <p className="inline-flex items-center gap-1 font-semibold text-destructive">
                <XCircle className="size-4" /> {formatNumber(a.incorrect_count)}
              </p>
              <p className="text-xs text-muted-foreground">غلط</p>
            </div>
            <div>
              <p className="inline-flex items-center gap-1 font-semibold text-muted-foreground">
                <MinusCircle className="size-4" /> {formatNumber(a.unanswered_count)}
              </p>
              <p className="text-xs text-muted-foreground">نزده</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {(review.per_subject ?? []).length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">کارنامه به تفکیک درس</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(review.per_subject ?? []).map((s) => (
              <div key={s.subject_id ?? s.name} className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">
                    {s.name}
                    {s.coefficient != null && (
                      <span className="ms-2 text-xs text-muted-foreground">
                        ضریب {formatNumber(s.coefficient)}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatNumber(s.correct_count)} صحیح · {formatNumber(s.incorrect_count)} غلط ·{" "}
                    {formatNumber(s.unanswered_count)} نزده — {formatPercent(s.percentage / 100)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      s.percentage >= 50 ? "bg-emerald-500" : "bg-destructive",
                    )}
                    style={{ width: `${Math.min(100, Math.max(0, s.percentage))}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="mb-6">
        <AiCoachCard compact />
      </div>

      <h2 className="mb-3 text-lg font-bold">مرور پاسخ‌ها</h2>
      <div className="space-y-4">
        {review.questions.map((qq, i) => {
          const selected = qq.options.find((o) => o.id === qq.selected_option_id);
          const correct = qq.options.find((o) => o.is_correct);
          return (
            <Card key={qq.question_id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-start justify-between gap-3 text-sm">
                  <span className="leading-7">
                    {formatNumber(i + 1)}. {qq.question_text}
                    {qq.subject_name && (
                      <span className="ms-2 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {qq.subject_name}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    نمره: {formatNumber(qq.score)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="space-y-1">
                  {qq.options.map((o) => {
                    const isSelected = o.id === qq.selected_option_id;
                    const isCorrect = o.is_correct;
                    return (
                      <div
                        key={o.id}
                        className={cn(
                          "rounded-lg border px-3 py-2",
                          isCorrect && "border-emerald-500/50 bg-emerald-500/10",
                          isSelected && !isCorrect && "border-destructive/50 bg-destructive/10",
                          !isCorrect && !isSelected && "border-border",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          {isCorrect && (
                            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                          )}
                          {isSelected && !isCorrect && (
                            <XCircle className="size-4 shrink-0 text-destructive" />
                          )}
                          {o.option_text}
                          {isSelected && (
                            <span className="ms-auto text-xs text-muted-foreground">پاسخ شما</span>
                          )}
                          {isCorrect && (
                            <span className="ms-auto text-xs font-medium text-emerald-600">
                              پاسخ صحیح
                            </span>
                          )}
                        </span>
                        <OptionImage url={o.image_url} />
                      </div>
                    );
                  })}
                </div>
                {qq.explanation && (
                  <p className="rounded-lg bg-muted/40 p-3 text-xs leading-6 text-muted-foreground">
                    {qq.explanation}
                  </p>
                )}
                {!selected && <p className="text-xs text-muted-foreground">پاسخی ثبت نشده بود.</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 text-center">
        <Button asChild>
          <Link to="/exam/$slug" params={{ slug }}>
            <RotateCcw className="size-4" />
            آزمون مجدد
          </Link>
        </Button>
      </div>
    </div>
  );
}
