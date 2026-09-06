import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getQuestionExplanation } from "@/lib/practice.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { humanizeError } from "@/lib/format";
import type { ExplanationResult } from "@/lib/practice.schema";

/** وضعیت پاسخ تشریحی ذخیره‌شده برای مجموعه‌ای از سوال‌ها. */
export function useExplanationStatus(questionIds: string[]) {
  return useQuery({
    queryKey: ["admin", "ai-explanations", questionIds] as const,
    enabled: questionIds.length > 0,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_explanations")
        .select("question_id, model, updated_at")
        .in("question_id", questionIds);
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.question_id, r]));
    },
  });
}

/** دکمه و پنجره «تولید پاسخ هوشمند» برای یک سوال در پنل مدیریت. */
export function QuestionAiAnswerButton({
  questionId,
  questionText,
  hasExplanation,
}: {
  questionId: string;
  questionText: string;
  hasExplanation: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ExplanationResult | null>(null);
  const generate = useServerFn(getQuestionExplanation);

  const mutation = useMutation({
    mutationFn: (force: boolean) => generate({ data: { questionId, force } }),
    onSuccess: (data) => {
      setResult(data);
      void qc.invalidateQueries({ queryKey: ["admin", "ai-explanations"] });
      toast.success(data.cached ? "پاسخ ذخیره‌شده نمایش داده شد." : "پاسخ هوشمند تولید شد.");
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  return (
    <>
      <Button
        size="sm"
        variant={hasExplanation ? "ghost" : "secondary"}
        onClick={() => {
          setOpen(true);
          setResult(null);
          mutation.mutate(false);
        }}
      >
        <Sparkles className="size-4" />
        {hasExplanation ? "مشاهده" : "تولید"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>پاسخ تشریحی هوش مصنوعی</DialogTitle>
            <DialogDescription className="line-clamp-3">{questionText}</DialogDescription>
          </DialogHeader>

          {mutation.isPending ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              در حال تولید پاسخ تشریحی…
            </div>
          ) : mutation.isError ? (
            <p className="py-6 text-sm text-destructive">{humanizeError(mutation.error)}</p>
          ) : result ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{result.cached ? "ذخیره‌شده" : "تولید جدید"}</Badge>
                {result.model && (
                  <span className="text-xs text-muted-foreground">مدل: {result.model}</span>
                )}
              </div>
              <div className="whitespace-pre-wrap rounded-xl border bg-muted/30 p-4 text-sm leading-7">
                {result.explanation}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              بستن
            </Button>
            <Button
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(true)}
            >
              <RefreshCw className="size-4" />
              تولید مجدد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** تولید گروهی پاسخ هوشمند برای سوال‌های بدون پاسخ در صفحه جاری. */
export function BulkGenerateAiAnswers({ questionIds }: { questionIds: string[] }) {
  const qc = useQueryClient();
  const generate = useServerFn(getQuestionExplanation);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      let ok = 0;
      let failed = 0;
      setProgress({ done: 0, total: questionIds.length });
      for (const [index, id] of questionIds.entries()) {
        try {
          await generate({ data: { questionId: id } });
          ok += 1;
        } catch {
          failed += 1;
        }
        setProgress({ done: index + 1, total: questionIds.length });
      }
      return { ok, failed };
    },
    onSuccess: ({ ok, failed }) => {
      void qc.invalidateQueries({ queryKey: ["admin", "ai-explanations"] });
      setProgress(null);
      toast.success(`${ok} پاسخ آماده شد${failed ? ` · ${failed} خطا` : ""}.`);
    },
    onError: (e) => {
      setProgress(null);
      toast.error(humanizeError(e));
    },
  });

  if (questionIds.length === 0) return null;

  return (
    <Button
      variant="secondary"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
      title="برای سوال‌های بدون پاسخ تشریحی در این صفحه"
    >
      {mutation.isPending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {progress ? `${progress.done} از ${progress.total}` : "در حال تولید…"}
        </>
      ) : (
        <>
          <Sparkles className="size-4" />
          تولید پاسخ هوشمند ({questionIds.length})
        </>
      )}
    </Button>
  );
}
