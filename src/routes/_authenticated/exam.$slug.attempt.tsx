import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState, ErrorState } from "@/components/data-states";
import { formatDuration, formatNumber, humanizeError } from "@/lib/format";
import { rpc } from "@/lib/supabase-rpc";
import { OptionImage } from "@/components/option-image";
import { cn } from "@/lib/utils";
import type { AttemptState, SubmitResult } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/exam/$slug/attempt")({
  validateSearch: (s: Record<string, unknown>) => ({
    attemptId: typeof s["attemptId"] === "string" ? s["attemptId"] : undefined,
  }),
  component: AttemptPage,
});

function AttemptPage() {
  const { slug } = Route.useParams();
  const { attemptId } = Route.useSearch();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ["attempt", attemptId],
    enabled: !!attemptId,
    queryFn: async () => {
      try {
        return await rpc<AttemptState>("get_attempt_state", { p_attempt_id: attemptId });
      } catch (e) {
        console.error("[attempt] get_attempt_state failed", e);
        throw e;
      }
    },
  });

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);

  const state = query.data;

  // Deadline from expires_at, else started_at + duration.
  const deadline = useMemo(() => {
    if (!state) return 0;
    if (state.attempt.expires_at) return new Date(state.attempt.expires_at).getTime();
    const dur = state.exam.duration_minutes ?? 60;
    return new Date(state.attempt.started_at).getTime() + dur * 60_000;
  }, [state]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = Math.max(0, Math.floor((deadline - now) / 1000));

  const questions = useMemo(() => state?.questions ?? [], [state]);
  const q = questions[current];

  // Questions arrive already ordered by subject; group them for navigation.
  const groups = useMemo(() => {
    const out: { key: string; name: string; indexes: number[] }[] = [];
    questions.forEach((qq, i) => {
      const key = qq.exam_subject_id ?? qq.subject_id ?? "__none";
      const last = out[out.length - 1];
      if (last && last.key === key) last.indexes.push(i);
      else out.push({ key, name: qq.subject_name ?? "سایر سوال‌ها", indexes: [i] });
    });
    return out;
  }, [questions]);
  const hasSubjects = groups.length > 1 || (groups[0]?.key ?? "__none") !== "__none";

  const submit = useCallback(
    async (reason: "manual" | "timeout") => {
      if (!attemptId || submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      setError(null);
      try {
        await rpc<SubmitResult>("submit_attempt", { p_attempt_id: attemptId });
        await navigate({
          to: "/exam/$slug/result",
          params: { slug },
          search: { attemptId },
        });
      } catch (e) {
        console.error("[attempt] submit_attempt failed", e);
        submittedRef.current = false;
        setSubmitting(false);
        setError(humanizeError(e) + (import.meta.env.DEV ? ` (raw: ${String(e)})` : ""));
      }
    },
    [attemptId, slug, navigate],
  );

  // Auto-submit on timeout.
  useEffect(() => {
    if (remaining === 0 && deadline > 0 && !submitting && state?.attempt.status === "in_progress") {
      void submit("timeout");
    }
  }, [remaining, deadline, submitting, state, submit]);

  useEffect(() => {
    if (state && state.attempt.status === "submitted") {
      void navigate({
        to: "/exam/$slug/result",
        params: { slug },
        search: { attemptId: state.attempt.id },
      });
    }
  }, [state, slug, navigate]);

  const selectOption = async (questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
    try {
      await rpc("save_answer", {
        p_attempt_id: attemptId,
        p_question_id: questionId,
        p_option_id: optionId,
      });
    } catch (e) {
      // keep local selection even if the save call fails transiently
      console.error("[attempt] save_answer failed", e);
    }
  };

  if (query.isLoading) return <LoadingState rows={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!state) return <ErrorState error="آزمون یافت نشد." onRetry={() => void query.refetch()} />;

  const answeredCount = questions.filter((qq) => answers[qq.question_id]).length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
        <p className="font-semibold">{state.exam.title}</p>
        <div className="flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-600" />
            {formatNumber(answeredCount)}/{formatNumber(questions.length)}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 font-mono text-base font-bold",
              remaining < 60 ? "text-destructive" : "text-foreground",
            )}
            dir="ltr"
          >
            <Clock className="size-4" />
            {formatDuration(remaining)}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="size-4 text-destructive" />
          {error}
        </div>
      )}

      {remaining === 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-300/50 bg-amber-500/10 p-3 text-sm">
          زمان آزمون به پایان رسیده است؛ در حال ثبت نهایی پاسخ‌ها…
        </div>
      )}

      {q ? (
        <Card>
          <CardContent className="space-y-5 p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-muted-foreground">
                سوال {formatNumber(current + 1)} از {formatNumber(questions.length)}
                {q.subject_name && (
                  <span className="ms-2 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {q.subject_name}
                  </span>
                )}
              </p>
              <span className="text-xs text-muted-foreground">نمره: {formatNumber(q.score)}</span>
            </div>

            <h2 className="text-lg font-semibold leading-8">{q.question_text}</h2>

            <div className="space-y-2">
              {q.options.map((opt) => {
                const selected = answers[q.question_id] === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => void selectOption(q.question_id, opt.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border p-3 text-start text-sm transition-colors",
                      selected
                        ? "border-primary bg-primary/10 font-medium"
                        : "border-border bg-card hover:border-primary/50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      {selected && <CheckCircle2 className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      {opt.option_text}
                      <OptionImage url={opt.image_url} />
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button
                variant="outline"
                disabled={current === 0}
                onClick={() => setCurrent((c) => c - 1)}
              >
                سوال قبلی
              </Button>
              {current < questions.length - 1 ? (
                <Button onClick={() => setCurrent((c) => c + 1)}>سوال بعدی</Button>
              ) : (
                <Button
                  variant="destructive"
                  disabled={submitting}
                  onClick={() => void submit("manual")}
                >
                  <Send className="size-4" />
                  {submitting ? "در حال ثبت…" : "ثبت نهایی آزمون"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-4 p-5 text-center">
            <p className="text-muted-foreground">هیچ سوالی در این آزمون وجود ندارد.</p>
            <Button
              variant="destructive"
              disabled={submitting}
              onClick={() => void submit("manual")}
            >
              ثبت نهایی آزمون
            </Button>
          </CardContent>
        </Card>
      )}

      {questions.length > 1 && (
        <div className="mt-4 space-y-3">
          {groups.map((g) => (
            <div key={g.key}>
              {hasSubjects && (
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {g.name} ({formatNumber(g.indexes.length)} سوال)
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {g.indexes.map((i) => {
                  const qq = questions[i]!;
                  const answered = !!answers[qq.question_id];
                  const isCurrent = i === current;
                  return (
                    <button
                      key={qq.question_id}
                      type="button"
                      onClick={() => setCurrent(i)}
                      className={cn(
                        "flex size-9 items-center justify-center rounded-lg border text-sm",
                        isCurrent && "border-primary bg-primary text-primary-foreground",
                        !isCurrent &&
                          answered &&
                          "border-emerald-500/60 bg-emerald-500/10 text-emerald-700",
                        !isCurrent && !answered && "border-border text-muted-foreground",
                      )}
                    >
                      {formatNumber(i + 1)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
