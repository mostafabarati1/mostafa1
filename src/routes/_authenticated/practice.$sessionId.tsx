import { useState } from "react";
import { OptionImage } from "@/components/option-image";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Flag, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CardsLoading, EmptyState, ErrorState, PageHeader } from "@/components/data-states";
import { AiExplanation } from "@/components/practice/ai-explanation";
import { humanizeError, formatNumber } from "@/lib/format";
import {
  DIFFICULTY_LABELS,
  practiceSessionSchema,
  type PracticeSessionQuestion,
} from "@/lib/practice.schema";

export const Route = createFileRoute("/_authenticated/practice/$sessionId")({
  head: () => ({
    meta: [
      { title: "آزمون تمرینی | همراه استخدام" },
      {
        name: "description",
        content: "پاسخ‌دهی به سوالات آزمون تمرینی و مشاهده پاسخ تشریحی هوش مصنوعی برای هر سوال.",
      },
      { property: "og:title", content: "آزمون تمرینی" },
      {
        property: "og:description",
        content: "سوال‌های انتخابی خود را تمرین کنید و بلافاصله پاسخ درست و تشریح کامل را ببینید.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PracticeSessionPage,
});

function PracticeSessionPage() {
  const { sessionId } = Route.useParams();
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ["practice-session", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_practice_session", {
        p_session_id: sessionId,
      });
      if (error) throw error;
      return practiceSessionSchema.parse(data);
    },
  });

  const finishSession = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("finish_practice_session", {
        p_session_id: sessionId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["practice-session", sessionId] });
      void queryClient.invalidateQueries({ queryKey: ["practice-sessions"] });
    },
  });

  const session = sessionQuery.data;
  const answered = session?.questions.filter((q) => q.answer?.selected_option_id).length ?? 0;
  const progress = session && session.total > 0 ? (answered / session.total) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="آزمون تمرینی"
        description="به سوال‌ها پاسخ دهید؛ برای هر سوال می‌توانید پاسخ درست و تشریح کامل هوش مصنوعی را ببینید."
        actions={
          <Button asChild variant="outline">
            <Link to="/practice">
              <ArrowRight className="size-4" />
              بازگشت به تمرین
            </Link>
          </Button>
        }
      />

      {sessionQuery.isLoading ? (
        <CardsLoading count={3} />
      ) : sessionQuery.isError ? (
        <ErrorState error={sessionQuery.error} onRetry={() => void sessionQuery.refetch()} />
      ) : !session || session.questions.length === 0 ? (
        <EmptyState
          title="سوالی در این جلسه نیست"
          description="با فیلترهای دیگری آزمون تمرینی جدیدی بسازید."
          action={
            <Button asChild size="sm">
              <Link to="/practice">شروع تمرین جدید</Link>
            </Button>
          }
        />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="min-w-52 flex-1">
                <div className="mb-2 flex justify-between text-sm">
                  <span>پیشرفت</span>
                  <span>
                    {formatNumber(answered)} از {formatNumber(session.total)}
                  </span>
                </div>
                <Progress value={progress} />
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="size-4" />
                  {formatNumber(session.correct_count)}
                </span>
                <span className="flex items-center gap-1 text-destructive">
                  <XCircle className="size-4" />
                  {formatNumber(session.incorrect_count)}
                </span>
                {session.status === "finished" ? (
                  <Badge>پایان‌یافته</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={finishSession.isPending}
                    onClick={() => finishSession.mutate()}
                  >
                    <Flag className="size-4" />
                    پایان تمرین
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {finishSession.isError && (
            <p role="alert" className="text-sm text-destructive">
              {humanizeError(finishSession.error)}
            </p>
          )}

          <div className="space-y-4">
            {session.questions.map((q, index) => (
              <SessionQuestionCard
                key={q.id}
                index={index}
                sessionId={sessionId}
                question={q}
                readOnly={session.status === "finished"}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SessionQuestionCard({
  index,
  sessionId,
  question,
  readOnly,
}: {
  index: number;
  sessionId: string;
  question: PracticeSessionQuestion;
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(
    question.answer?.selected_option_id ?? null,
  );
  const [revealed, setRevealed] = useState(false);
  const correctOption = question.options.find((o) => o.is_correct) ?? null;

  const answer = useMutation({
    mutationFn: async (optionId: string) => {
      const { error } = await supabase.rpc("answer_practice_question", {
        p_session_id: sessionId,
        p_question_id: question.id,
        p_option_id: optionId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["practice-session", sessionId] });
    },
  });

  const showResult = revealed || selected !== null;

  return (
    <Card>
      <CardContent className="py-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge>سوال {formatNumber(index + 1)}</Badge>
          <Badge variant="secondary">
            {DIFFICULTY_LABELS[question.difficulty] ?? question.difficulty}
          </Badge>
          {question.subject && <Badge variant="outline">{question.subject}</Badge>}
        </div>

        <p className="whitespace-pre-wrap font-medium leading-8">{question.question_text}</p>

        <ul className="mt-4 space-y-2">
          {question.options.map((o) => {
            const isSelected = selected === o.id;
            const state = showResult
              ? o.is_correct
                ? "border-emerald-500/60 bg-emerald-500/10"
                : isSelected
                  ? "border-destructive/60 bg-destructive/10"
                  : ""
              : isSelected
                ? "border-primary"
                : "";
            return (
              <li key={o.id}>
                <button
                  type="button"
                  disabled={readOnly || answer.isPending}
                  onClick={() => {
                    setSelected(o.id);
                    answer.mutate(o.id);
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-start text-sm transition-colors hover:bg-muted/60 disabled:cursor-not-allowed ${state}`}
                >
                  {o.option_text}
                  <OptionImage url={o.image_url} />
                </button>
              </li>
            );
          })}
        </ul>

        {answer.isError && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {humanizeError(answer.error)}
          </p>
        )}

        <AiExplanation
          questionId={question.id}
          correctOptionText={correctOption?.option_text ?? null}
          hasExplanation={question.has_explanation}
          onRevealed={() => setRevealed(true)}
        />
      </CardContent>
    </Card>
  );
}
