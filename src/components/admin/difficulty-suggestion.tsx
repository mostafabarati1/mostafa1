import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gauge, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  applyQuestionDifficulty,
  suggestQuestionDifficulty,
  type DifficultySuggestionResult,
} from "@/lib/ai-difficulty.functions";
import { humanizeError } from "@/lib/format";

const LABELS: Record<string, string> = { easy: "آسان", medium: "متوسط", hard: "دشوار" };

/**
 * پیشنهاد سطح دشواری با هوش مصنوعی.
 * پیشنهاد فقط نمایش داده می‌شود؛ تغییر سطح واقعی سوال تنها با دکمه «اعمال».
 */
export function DifficultySuggestion({
  questionId,
  onApplied,
}: {
  questionId: string;
  onApplied?: (difficulty: "easy" | "medium" | "hard") => void;
}) {
  const [result, setResult] = useState<DifficultySuggestionResult | null>(null);
  const suggestFn = useServerFn(suggestQuestionDifficulty);
  const applyFn = useServerFn(applyQuestionDifficulty);

  const suggestMut = useMutation({
    mutationFn: () => suggestFn({ data: { questionId } }),
    onSuccess: setResult,
    onError: (e) => toast.error(humanizeError(e)),
  });

  const applyMut = useMutation({
    mutationFn: (difficulty: "easy" | "medium" | "hard") =>
      applyFn({ data: { questionId, difficulty } }),
    onSuccess: (_data, difficulty) => {
      toast.success("سطح دشواری به‌روزرسانی شد.");
      onApplied?.(difficulty);
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">پیشنهاد سطح دشواری با هوش مصنوعی</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={suggestMut.isPending}
          onClick={() => suggestMut.mutate()}
        >
          {suggestMut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Gauge className="size-4" />
          )}
          تحلیل سوال
        </Button>
      </div>

      {result && (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">پیشنهاد: {LABELS[result.difficulty]}</Badge>
            <Badge variant="outline">
              اطمینان: {Math.round(result.confidence * 100).toLocaleString("fa-IR")}٪
            </Badge>
            <Badge variant="outline">
              فعلی: {LABELS[result.current_difficulty ?? ""] ?? result.current_difficulty ?? "—"}
            </Badge>
          </div>
          {result.reason && <p className="text-xs text-muted-foreground">{result.reason}</p>}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={applyMut.isPending}
            onClick={() => applyMut.mutate(result.difficulty)}
          >
            {applyMut.isPending && <Loader2 className="size-4 animate-spin" />}
            اعمال سطح پیشنهادی
          </Button>
        </div>
      )}
    </div>
  );
}
