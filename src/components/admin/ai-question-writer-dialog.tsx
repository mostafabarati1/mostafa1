import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  approveAiQuestionDraft,
  generateAiQuestionDrafts,
  listAiQuestionDrafts,
  rejectAiQuestionDraft,
  updateAiQuestionDraft,
} from "@/lib/ai-question.functions";
import type { AiQuestionDraft } from "@/lib/ai-question.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { humanizeError } from "@/lib/format";

const NONE = "__none__";

type Cat = { id: string; name: string };
type Subject = { id: string; name: string };

/** پیش‌نویس قابل‌ویرایش پیش از تأیید یا رد. */
type EditableDraft = AiQuestionDraft & { savingApprove?: boolean };

/**
 * «تولید سوال با هوش مصنوعی»: دسته/درس/موضوع و تعداد را می‌گیرد، پیش‌نویس‌ها
 * را می‌سازد و فقط با تأیید صریح مدیر برای هر مورد وارد بانک سوال می‌شود.
 */
export function AiQuestionWriterDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string>(NONE);
  const [subjectId, setSubjectId] = useState<string>(NONE);
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(2);
  const [drafts, setDrafts] = useState<EditableDraft[]>([]);

  const generateFn = useServerFn(generateAiQuestionDrafts);
  const listFn = useServerFn(listAiQuestionDrafts);
  const updateFn = useServerFn(updateAiQuestionDraft);
  const approveFn = useServerFn(approveAiQuestionDraft);
  const rejectFn = useServerFn(rejectAiQuestionDraft);

  const catsQ = useQuery({
    queryKey: ["admin-cats"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Cat[];
    },
  });

  const subjectsQ = useQuery({
    queryKey: ["admin-subjects-select"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Subject[];
    },
  });

  const generateMut = useMutation({
    mutationFn: async () => {
      const { ids } = await generateFn({
        data: {
          categoryId: categoryId === NONE ? null : categoryId,
          subjectId: subjectId === NONE ? null : subjectId,
          topic: topic.trim(),
          count,
        },
      });
      const all = await listFn({ data: { status: "draft" } });
      return all.filter((d) => ids.includes(d.id));
    },
    onSuccess: (rows) => {
      setDrafts(rows);
      toast.success(`${rows.length} پیش‌نویس تولید شد.`);
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const saveDraftMut = useMutation({
    mutationFn: (draft: EditableDraft) =>
      updateFn({
        data: {
          id: draft.id,
          question_text: draft.question_text,
          difficulty: (draft.difficulty ?? "medium") as "easy" | "medium" | "hard",
          category_id: draft.category_id,
          subject_id: draft.subject_id,
          options: draft.options,
          explanation: draft.explanation,
        },
      }),
    onError: (e) => toast.error(humanizeError(e)),
  });

  const approveMut = useMutation({
    mutationFn: async (draft: EditableDraft) => {
      await saveDraftMut.mutateAsync(draft);
      return approveFn({
        data: {
          id: draft.id,
          question_text: draft.question_text,
          difficulty: (draft.difficulty ?? "medium") as "easy" | "medium" | "hard",
          category_id: draft.category_id,
          score: 1,
          options: draft.options,
          explanation: draft.explanation,
        },
      });
    },
    onSuccess: (_res, draft) => {
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      void qc.invalidateQueries({ queryKey: ["admin-questions"] });
      toast.success("سوال تأیید و در بانک سوال ذخیره شد.");
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const rejectMut = useMutation({
    mutationFn: (draft: EditableDraft) => rejectFn({ data: { id: draft.id } }),
    onSuccess: (_res, draft) => {
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      toast.message("پیش‌نویس رد شد.");
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const patchDraft = (id: string, patch: Partial<EditableDraft>) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const patchOption = (
    id: string,
    index: number,
    patch: Partial<{ option_text: string; is_correct: boolean }>,
  ) =>
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              options: d.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
            }
          : d,
      ),
    );

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Sparkles className="size-4" />
        تولید سوال با هوش مصنوعی
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تولید سوال با هوش مصنوعی</DialogTitle>
            <DialogDescription>
              پیش‌نویس‌های تولیدشده تا تأیید صریح شما وارد بانک سوال نمی‌شوند.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>دسته‌بندی</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="بدون دسته" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>بدون دسته</SelectItem>
                  {(catsQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>درس</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="بدون درس" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>بدون درس</SelectItem>
                  {(subjectsQ.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>موضوع</Label>
              <Input
                placeholder="مثلاً: قوانین استخدامی، دستور زبان فارسی…"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>تعداد سوال</Label>
              <Input
                type="number"
                min={1}
                max={4}
                value={count}
                onChange={(e) => setCount(Math.min(4, Math.max(1, Number(e.target.value) || 1)))}
              />
            </div>
            <div className="flex items-end sm:col-span-3">
              <Button
                type="button"
                className="w-full"
                disabled={generateMut.isPending || topic.trim().length < 2}
                onClick={() => generateMut.mutate()}
              >
                {generateMut.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                تولید پیش‌نویس
              </Button>
            </div>
          </div>

          {drafts.length > 0 && (
            <div className="space-y-4">
              {drafts.map((d) => (
                <div key={d.id} className="space-y-3 rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary">{d.difficulty ?? "medium"}</Badge>
                  </div>
                  <Textarea
                    rows={2}
                    value={d.question_text}
                    onChange={(e) => patchDraft(d.id, { question_text: e.target.value })}
                  />
                  <div className="space-y-2">
                    {d.options.map((o, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Checkbox
                          checked={o.is_correct}
                          onCheckedChange={(v) => patchOption(d.id, i, { is_correct: v === true })}
                          aria-label={`گزینه ${i + 1} صحیح`}
                        />
                        <Input
                          value={o.option_text}
                          onChange={(e) => patchOption(d.id, i, { option_text: e.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <Label>پاسخ تشریحی</Label>
                    <Textarea
                      rows={2}
                      value={d.explanation ?? ""}
                      onChange={(e) => patchDraft(d.id, { explanation: e.target.value })}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={rejectMut.isPending}
                      onClick={() => rejectMut.mutate(d)}
                    >
                      <X className="size-4" />
                      رد
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={approveMut.isPending}
                      onClick={() => approveMut.mutate(d)}
                    >
                      {approveMut.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      تأیید و ذخیره
                    </Button>
                  </div>
                </div>
              ))}
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
