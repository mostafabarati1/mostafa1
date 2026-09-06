import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2 } from "lucide-react";
import { getQuestionExplanation } from "@/lib/practice.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { humanizeError } from "@/lib/format";
import type { ExplanationResult } from "@/lib/practice.schema";

/**
 * دکمه «پاسخ درست + پاسخ تشریحی هوش مصنوعی».
 * برای هر سوال فقط یک بار تولید می‌شود و سپس از کش دیتابیس خوانده می‌شود.
 */
export function AiExplanation({
  questionId,
  correctOptionText,
  hasExplanation,
  onRevealed,
}: {
  questionId: string;
  correctOptionText: string | null;
  hasExplanation?: boolean;
  onRevealed?: () => void;
}) {
  const [result, setResult] = useState<ExplanationResult | null>(null);
  const fetchExplanation = useServerFn(getQuestionExplanation);

  const mutation = useMutation({
    mutationFn: async () => fetchExplanation({ data: { questionId } }),
    onSuccess: (data) => {
      setResult(data);
      onRevealed?.();
    },
  });

  if (result) {
    return (
      <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <span className="text-sm font-bold">پاسخ تشریحی</span>
          <Badge variant="secondary">{result.cached ? "ذخیره‌شده" : "تولید جدید"}</Badge>
        </div>
        {correctOptionText && (
          <p className="mb-3 text-sm">
            <span className="font-medium text-muted-foreground">پاسخ درست: </span>
            <span className="font-bold text-primary">{correctOptionText}</span>
          </p>
        )}
        <div className="whitespace-pre-wrap text-sm leading-7 text-foreground">
          {result.explanation}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <Button
        variant="secondary"
        size="sm"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            در حال تولید پاسخ تشریحی…
          </>
        ) : (
          <>
            <Sparkles className="size-4" />
            نمایش پاسخ درست و تشریحی
          </>
        )}
      </Button>
      {hasExplanation && !mutation.isPending && (
        <span className="ms-2 text-xs text-muted-foreground">پاسخ تشریحی آماده است</span>
      )}
      {mutation.isError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {humanizeError(mutation.error)}
        </p>
      )}
    </div>
  );
}
