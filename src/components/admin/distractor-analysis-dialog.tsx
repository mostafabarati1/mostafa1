import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  applyDistractorSuggestion,
  loadDistractorQuestionInput,
  runDistractorAnalysis,
} from "@/lib/ai-distractor.functions";
import type {
  DistractorAnalysisItem,
  DistractorQuality,
  DistractorQuestionInput,
} from "@/lib/ai-distractor.types";
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

const QUALITY_LABEL: Record<DistractorQuality, string> = {
  strong: "قوی",
  weak: "ضعیف",
  obviously_wrong: "واضحاً غلط",
  too_close: "بیش‌ازحد نزدیک به پاسخ صحیح",
};

const QUALITY_VARIANT: Record<
  DistractorQuality,
  "default" | "secondary" | "destructive" | "outline"
> = {
  strong: "default",
  weak: "secondary",
  obviously_wrong: "destructive",
  too_close: "outline",
};

/**
 * دکمه و پنجره «تحلیل هوشمند گزینه‌ها» برای یک سوال؛ برای هر گزینه نادرست
 * کیفیت/دلیل/پیشنهاد نمایش داده می‌شود و اعمال پیشنهاد فقط تک‌به‌تک است.
 */
export function DistractorAnalysisDialog({
  questionId,
  questionText,
  trigger,
}: {
  questionId: string;
  questionText: string;
  trigger?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState<DistractorQuestionInput | null>(null);
  const [appliedIndexes, setAppliedIndexes] = useState<Set<number>>(new Set());

  const loadFn = useServerFn(loadDistractorQuestionInput);
  const analyzeFn = useServerFn(runDistractorAnalysis);
  const applyFn = useServerFn(applyDistractorSuggestion);

  const loadMut = useMutation({
    mutationFn: () => loadFn({ data: { questionId } }),
    onSuccess: (data) => {
      setInput(data);
      setAppliedIndexes(new Set());
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const analyzeMut = useMutation({
    mutationFn: () => analyzeFn({ data: { questionId } }),
    onSuccess: (data) => {
      setInput(data);
      setAppliedIndexes(new Set());
      toast.success("تحلیل گزینه‌ها انجام و ذخیره شد.");
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const applyMut = useMutation({
    mutationFn: (item: DistractorAnalysisItem) => {
      const option = input?.options[item.option_index];
      if (!option) throw new Error("گزینه یافت نشد.");
      return applyFn({
        data: { questionId, optionId: option.id, optionText: item.suggestion },
      });
    },
    onSuccess: (_res, item) => {
      setAppliedIndexes((prev) => new Set(prev).add(item.option_index));
      setInput((prev) =>
        prev
          ? {
              ...prev,
              options: prev.options.map((o, i) =>
                i === item.option_index ? { ...o, option_text: item.suggestion } : o,
              ),
            }
          : prev,
      );
      void qc.invalidateQueries({ queryKey: ["admin-questions"] });
      void qc.invalidateQueries({ queryKey: ["admin-question-options"] });
      toast.success("پیشنهاد روی گزینه اعمال شد.");
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const report = input?.ai_distractor_report ?? [];

  return (
    <>
      {trigger ? (
        <span
          onClick={() => {
            setOpen(true);
            loadMut.mutate();
          }}
        >
          {trigger}
        </span>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setOpen(true);
            loadMut.mutate();
          }}
        >
          <Wand2 className="size-4" />
          تحلیل گزینه‌ها
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تحلیل هوشمند گزینه‌ها</DialogTitle>
            <DialogDescription className="line-clamp-3">{questionText}</DialogDescription>
          </DialogHeader>

          {loadMut.isPending ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              در حال بارگذاری…
            </div>
          ) : loadMut.isError ? (
            <p className="py-6 text-sm text-destructive">{humanizeError(loadMut.error)}</p>
          ) : (
            <div className="space-y-4">
              <Button
                type="button"
                variant="secondary"
                disabled={analyzeMut.isPending}
                onClick={() => analyzeMut.mutate()}
              >
                {analyzeMut.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Wand2 className="size-4" />
                )}
                {report.length > 0 ? "تحلیل مجدد" : "شروع تحلیل"}
              </Button>

              {report.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  هنوز تحلیلی برای این سوال انجام نشده است.
                </p>
              ) : (
                <div className="space-y-3">
                  {report.map((item) => {
                    const option = input?.options[item.option_index];
                    const applied = appliedIndexes.has(item.option_index);
                    return (
                      <div
                        key={item.option_index}
                        className="space-y-2 rounded-xl border p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{option?.option_text ?? "—"}</span>
                          <Badge variant={QUALITY_VARIANT[item.quality]}>
                            {QUALITY_LABEL[item.quality]}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground">{item.reason}</p>
                        {item.suggestion && (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-2">
                            <span>
                              پیشنهاد: <span className="font-medium">{item.suggestion}</span>
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant={applied ? "ghost" : "outline"}
                              disabled={applied || applyMut.isPending}
                              onClick={() => applyMut.mutate(item)}
                            >
                              {applied ? (
                                <>
                                  <CheckCircle2 className="size-4" />
                                  اعمال شد
                                </>
                              ) : applyMut.isPending ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                "اعمال"
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              بستن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
