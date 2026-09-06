import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, ListChecks, Loader2, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CardsLoading,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/data-states";
import { formatDate, formatNumber, humanizeError } from "@/lib/format";
import { rpc } from "@/lib/supabase-rpc";
import {
  DIFFICULTY_LABELS,
  practiceFiltersSchema,
  practiceListSchema,
  practiceSessionListSchema,
} from "@/lib/practice.schema";
import { Checkbox } from "@/components/ui/checkbox";
import type { ExamDetail } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/exam/$slug/practice")({
  head: () => ({
    meta: [
      { title: "تمرین این آزمون | همراه استخدام" },
      {
        name: "description",
        content: "تمرین اختصاصی سوالات همین آزمون با انتخاب سطح دشواری و تعداد سوال.",
      },
      { property: "og:title", content: "تمرین اختصاصی آزمون" },
      {
        property: "og:description",
        content: "فقط سوال‌های همین آزمون را تمرین کنید و پاسخ تشریحی هوش مصنوعی را ببینید.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExamPracticePage,
});

const ALL = "all";

function ExamPracticePage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [difficulty, setDifficulty] = useState<string>(ALL);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);

  const examQuery = useQuery({
    queryKey: ["exam", slug],
    queryFn: () => rpc<ExamDetail>("get_exam_public", { p_slug: slug }),
  });
  const examId = examQuery.data?.id;

  const filtersQuery = useQuery({
    queryKey: ["practice-filters"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("practice_filters");
      if (error) throw error;
      return practiceFiltersSchema.parse(data);
    },
  });

  const examSubjectIds = filtersQuery.data?.exams.find((e) => e.id === examId)?.subject_ids ?? [];
  const examSubjects = (filtersQuery.data?.subjects ?? []).filter((s) =>
    examSubjectIds.includes(s.id),
  );
  const selectedSubjectIds = subjectIds.filter((id) => examSubjectIds.includes(id));
  const subjectKey = [...selectedSubjectIds].sort().join(",");

  const questionsQuery = useQuery({
    enabled: !!examId,
    queryKey: ["exam-practice-questions", examId, difficulty, subjectKey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_practice_questions", {
        p_exam_id: examId!,
        ...(difficulty === ALL ? {} : { p_difficulty: difficulty }),
        ...(selectedSubjectIds.length ? { p_subject_ids: selectedSubjectIds } : {}),
        p_limit: 10,
        p_offset: 0,
      });
      if (error) throw error;
      return practiceListSchema.parse(data);
    },
  });

  const sessionsQuery = useQuery({
    enabled: !!examId,
    queryKey: ["exam-practice-sessions", examId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_practice_sessions", {
        p_limit: 5,
        p_exam_id: examId!,
      });
      if (error) throw error;
      return practiceSessionListSchema.parse(data ?? []);
    },
  });

  const startSession = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("start_practice_session", {
        p_exam_id: examId!,
        ...(difficulty === ALL ? {} : { p_difficulty: difficulty }),
        ...(selectedSubjectIds.length ? { p_subject_ids: selectedSubjectIds } : {}),
        p_count: 60,
      });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: (sessionId) => {
      void navigate({ to: "/practice/$sessionId", params: { sessionId } });
    },
  });

  if (examQuery.isLoading) return <LoadingState rows={4} />;
  if (examQuery.isError)
    return <ErrorState error={examQuery.error} onRetry={() => void examQuery.refetch()} />;

  const exam = examQuery.data;
  const list = questionsQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`تمرین آزمون: ${exam?.title ?? ""}`}
        description="این بخش فقط سوال‌های همین آزمون را تمرین می‌دهد و از سایر آزمون‌ها جداست."
      />

      <Button asChild variant="ghost" size="sm">
        <Link to="/exam/$slug" params={{ slug }}>
          <ArrowRight className="size-4" />
          بازگشت به صفحه آزمون
        </Link>
      </Button>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Play className="size-4 text-primary" />
            شروع تمرین اختصاصی
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="w-40 space-y-1.5">
            <Label>سطح دشواری</Label>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger>
                <SelectValue placeholder="همه" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>همه سطح‌ها</SelectItem>
                <SelectItem value="easy">آسان</SelectItem>
                <SelectItem value="medium">متوسط</SelectItem>
                <SelectItem value="hard">دشوار</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {examSubjects.length > 0 && (
            <div className="w-full space-y-1.5">
              <Label>درس‌ها</Label>
              <div className="flex flex-wrap gap-2">
                {examSubjects.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={selectedSubjectIds.includes(s.id)}
                      onCheckedChange={(v) =>
                        setSubjectIds((prev) =>
                          v === true ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                        )
                      }
                    />
                    {s.name}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                اگر هیچ درسی انتخاب نشود، همه درس‌های این آزمون تمرین می‌شود.
              </p>
            </div>
          )}
          <Button
            disabled={startSession.isPending || !examId}
            onClick={() => startSession.mutate()}
          >
            {startSession.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                در حال آماده‌سازی…
              </>
            ) : (
              <>
                <Play className="size-4" />
                شروع تمرین این آزمون
              </>
            )}
          </Button>
          {startSession.isError && (
            <p role="alert" className="w-full text-sm text-destructive">
              {humanizeError(startSession.error)}
            </p>
          )}
        </CardContent>
      </Card>

      {sessionsQuery.data && sessionsQuery.data.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">تمرین‌های اخیر همین آزمون</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sessionsQuery.data.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground">{formatDate(s.created_at)}</span>
                <span>
                  {formatNumber(s.correct_count)} درست از {formatNumber(s.total)}
                </span>
                <Button asChild size="sm" variant="secondary">
                  <Link to="/practice/$sessionId" params={{ sessionId: s.id }}>
                    ادامه / مرور
                  </Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <ListChecks className="size-5 text-primary" />
          نمونه سوال‌های این آزمون
        </h2>
        {questionsQuery.isLoading ? (
          <CardsLoading count={3} />
        ) : questionsQuery.isError ? (
          <ErrorState error={questionsQuery.error} onRetry={() => void questionsQuery.refetch()} />
        ) : !list || list.items.length === 0 ? (
          <EmptyState
            title="سوالی برای این آزمون ثبت نشده است"
            description="پس از افزودن سوال به این آزمون، تمرین اختصاصی فعال می‌شود."
          />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              مجموع سوال‌های تمرینی این آزمون: {formatNumber(list.total)}
            </p>
            {list.items.map((q) => (
              <Card key={q.id}>
                <CardContent className="py-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {DIFFICULTY_LABELS[q.difficulty] ?? q.difficulty}
                    </Badge>
                    {q.subject && <Badge variant="outline">{q.subject}</Badge>}
                    {q.category && <Badge variant="outline">{q.category}</Badge>}
                  </div>
                  <p className="line-clamp-3 whitespace-pre-wrap leading-8">{q.question_text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
