import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { rpc } from "@/lib/supabase-rpc";
import { adminExamDetailQuery } from "@/lib/admin/queries";
import { formatNumber, humanizeError } from "@/lib/format";

type QuestionRow = {
  id: string;
  question_text: string;
  difficulty: string | null;
  status: string | null;
  category_name: string | null;
  default_score: number | null;
  option_count: number | null;
};

type QuestionsPage = {
  items: QuestionRow[];
  total: number;
  page: number;
  page_size: number;
};

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "آسان",
  medium: "متوسط",
  hard: "دشوار",
};

const PAGE_SIZE = 10;

/** مدیریت سوال‌های یک آزمون: جست‌وجو در بانک سوال، افزودن و حذف. */
export function ExamQuestionsEditor({ examId }: { examId: string }) {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const detail = useQuery(adminExamDetailQuery(examId));
  const attachedIds = detail.data?.question_ids ?? [];
  const attached = new Set(attachedIds);

  const attachedQuestions = useQuery({
    queryKey: ["admin", "exam", examId, "attached-questions", attachedIds] as const,
    enabled: attachedIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("id, question_text, difficulty, default_score")
        .in("id", attachedIds);
      if (error) throw error;
      const byId = new Map((data ?? []).map((q) => [q.id, q]));
      return attachedIds.map((id) => byId.get(id)).filter((q) => q != null);
    },
  });

  const bank = useQuery({
    queryKey: ["admin", "questions", { search, page, pageSize: PAGE_SIZE }] as const,
    queryFn: () =>
      rpc<QuestionsPage>("list_questions_admin", {
        p_search: search || null,
        p_category_id: null,
        p_page: page,
        p_page_size: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "exam", examId] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "exams"] });
  };

  const add = useMutation({
    mutationFn: (questionId: string) =>
      rpc("add_exam_question", { p_exam_id: examId, p_question_id: questionId }),
    onSuccess: () => {
      toast.success("سوال به آزمون افزوده شد.");
      refresh();
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const remove = useMutation({
    mutationFn: (questionId: string) =>
      rpc("remove_exam_question", { p_exam_id: examId, p_question_id: questionId }),
    onSuccess: () => {
      toast.success("سوال از آزمون حذف شد.");
      refresh();
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const busy = add.isPending || remove.isPending;
  const total = bank.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">سوال‌های آزمون</CardTitle>
        <Badge variant="secondary">{formatNumber(attached.size)} سوال انتخاب‌شده</Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">سوال‌های افزوده‌شده به این آزمون</h3>
          {detail.isLoading ? (
            <LoadingState rows={3} />
          ) : detail.error ? (
            <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
          ) : attachedIds.length === 0 ? (
            <EmptyState title="هنوز سوالی به این آزمون افزوده نشده است" />
          ) : attachedQuestions.isLoading ? (
            <LoadingState rows={3} />
          ) : attachedQuestions.error ? (
            <ErrorState
              error={attachedQuestions.error}
              onRetry={() => attachedQuestions.refetch()}
            />
          ) : (
            <ol className="space-y-2">
              {attachedQuestions.data?.map((q, index) => (
                <li
                  key={q.id}
                  className="flex items-start justify-between gap-3 rounded-xl border bg-muted/30 p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="line-clamp-2 text-sm font-medium">
                      {formatNumber(index + 1)}. {q.question_text}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {DIFFICULTY_LABEL[q.difficulty ?? ""] ?? q.difficulty ?? "—"} · بارم{" "}
                      {formatNumber(q.default_score ?? 0)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => remove.mutate(q.id)}
                  >
                    <Trash2 className="size-4" />
                    حذف
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">افزودن از بانک سوال</h3>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSearch(term.trim());
            }}
          >
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="جست‌وجو در متن سوال‌ها…"
              aria-label="جست‌وجوی سوال"
            />
            <Button type="submit" variant="secondary">
              <Search className="size-4" />
              جست‌وجو
            </Button>
          </form>

          {bank.isLoading ? (
            <LoadingState rows={4} />
          ) : bank.error ? (
            <ErrorState error={bank.error} onRetry={() => bank.refetch()} />
          ) : (bank.data?.items.length ?? 0) === 0 ? (
            <EmptyState title="سوالی با این جست‌وجو یافت نشد" />
          ) : (
            <ul className="space-y-2">
              {bank.data?.items.map((q) => {
                const isAttached = attached.has(q.id);
                return (
                  <li
                    key={q.id}
                    className="flex items-start justify-between gap-3 rounded-xl border p-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="line-clamp-2 text-sm font-medium">{q.question_text}</p>
                      <p className="text-xs text-muted-foreground">
                        {q.category_name ?? "بدون دسته"} ·{" "}
                        {DIFFICULTY_LABEL[q.difficulty ?? ""] ?? q.difficulty ?? "—"} ·{" "}
                        {formatNumber(q.option_count ?? 0)} گزینه · بارم{" "}
                        {formatNumber(q.default_score ?? 0)}
                      </p>
                    </div>
                    {isAttached ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => remove.mutate(q.id)}
                      >
                        <Trash2 className="size-4" />
                        حذف
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => add.mutate(q.id)}
                      >
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Plus className="size-4" />
                        )}
                        افزودن
                      </Button>
                    )}
                    {isAttached && (
                      <span className="sr-only">
                        <Check className="size-4" /> افزوده‌شده
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {formatNumber(total)} سوال · صفحه {formatNumber(page)} از {formatNumber(pageCount)}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                قبلی
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                بعدی
              </Button>
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
