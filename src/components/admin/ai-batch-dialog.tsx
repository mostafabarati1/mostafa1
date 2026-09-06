import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pause, Play, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getQuestionExplanation } from "@/lib/practice.functions";
import {
  createAiBatchJob,
  getAiBatchPendingCount,
  reportAiBatchProgress,
  setAiBatchJobStatus,
} from "@/lib/ai-batch.functions";
import { AI_BATCH_DELAY_MS, type AiBatchJob } from "@/lib/ai-batch/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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

const ALL = "__all__";

type RunState = {
  jobId: string | null;
  ids: string[];
  index: number;
  ok: number;
  failed: number;
  errors: { questionId: string; message: string }[];
  status: "idle" | "running" | "paused" | "done";
};

const initialRun: RunState = {
  jobId: null,
  ids: [],
  index: 0,
  ok: 0,
  failed: 0,
  errors: [],
  status: "idle",
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * «تولید انبوه پاسخ تشریحی» برای کل بانک سوال.
 *
 * صف در جدول `ai_explanation_jobs` ثبت می‌شود و هر سوال از همان مسیر موجود
 * `getQuestionExplanation` (کش‌دار) عبور می‌کند؛ رفتار پاسخ تشریحی کاربران
 * تغییری نمی‌کند.
 */
export function AiBatchDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string>(ALL);
  const [subjectId, setSubjectId] = useState<string>(ALL);
  const [run, setRun] = useState<RunState>(initialRun);

  const pausedRef = useRef(false);
  const cancelRef = useRef(false);

  const countFn = useServerFn(getAiBatchPendingCount);
  const createFn = useServerFn(createAiBatchJob);
  const progressFn = useServerFn(reportAiBatchProgress);
  const statusFn = useServerFn(setAiBatchJobStatus);
  const generate = useServerFn(getQuestionExplanation);

  const catsQ = useQuery({
    queryKey: ["admin-cats"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const subjectsQ = useQuery({
    queryKey: ["admin-subjects-select"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const filters = {
    categoryId: categoryId === ALL ? null : categoryId,
    subjectId: subjectId === ALL ? null : subjectId,
  };

  const pendingQ = useQuery({
    queryKey: ["ai-batch-pending", filters.categoryId, filters.subjectId],
    enabled: open,
    staleTime: 10_000,
    queryFn: () => countFn({ data: filters }),
  });

  const processQueue = useCallback(
    async (jobId: string, ids: string[], startIndex: number) => {
      for (let i = startIndex; i < ids.length; i += 1) {
        if (cancelRef.current) return;
        while (pausedRef.current && !cancelRef.current) {
          await sleep(300);
        }
        if (cancelRef.current) return;

        const questionId = ids[i]!;
        let ok = true;
        let message: string | null = null;
        try {
          await generate({ data: { questionId } });
        } catch (e) {
          ok = false;
          message = humanizeError(e).slice(0, 300);
        }

        try {
          await progressFn({ data: { jobId, questionId, ok, error: message } });
        } catch {
          /* گزارش پیشرفت نباید صف را متوقف کند */
        }

        setRun((prev) => ({
          ...prev,
          index: i + 1,
          ok: prev.ok + (ok ? 1 : 0),
          failed: prev.failed + (ok ? 0 : 1),
          errors: ok ? prev.errors : [...prev.errors, { questionId, message: message ?? "خطا" }],
        }));

        if (i < ids.length - 1) await sleep(AI_BATCH_DELAY_MS);
      }

      if (!cancelRef.current) {
        await statusFn({ data: { jobId, status: "done" } }).catch(() => undefined);
        setRun((prev) => ({ ...prev, status: "done" }));
        void qc.invalidateQueries({ queryKey: ["admin", "ai-explanations"] });
        void pendingQ.refetch();
        toast.success("تولید انبوه پاسخ تشریحی به پایان رسید.");
      }
    },
    [generate, progressFn, statusFn, qc, pendingQ],
  );

  const startMut = useMutation({
    mutationFn: async () => {
      const { jobId, questionIds } = await createFn({ data: { ...filters, limit: 5000 } });
      pausedRef.current = false;
      cancelRef.current = false;
      setRun({
        jobId,
        ids: questionIds,
        index: 0,
        ok: 0,
        failed: 0,
        errors: [],
        status: "running",
      });
      void processQueue(jobId, questionIds, 0);
      return questionIds.length;
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const togglePause = async () => {
    if (!run.jobId) return;
    const next = run.status === "paused" ? "running" : "paused";
    pausedRef.current = next === "paused";
    setRun((prev) => ({ ...prev, status: next }));
    await statusFn({ data: { jobId: run.jobId, status: next } }).catch(() => undefined);
  };

  const cancelRun = async () => {
    if (!run.jobId) return;
    cancelRef.current = true;
    pausedRef.current = false;
    const jobId = run.jobId;
    setRun((prev) => ({ ...prev, status: "done" }));
    await statusFn({ data: { jobId, status: "canceled" } }).catch(() => undefined);
    void qc.invalidateQueries({ queryKey: ["admin", "ai-explanations"] });
    toast.message("صف متوقف شد.");
  };

  // خروج از صفحه/بستن دیالوگ نباید حلقه را رها کند.
  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, []);

  const total = run.ids.length;
  const percent = total > 0 ? Math.round((run.index / total) * 100) : 0;
  const busy = run.status === "running" || run.status === "paused";

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Sparkles className="size-4" />
        تولید انبوه پاسخ تشریحی
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && busy) {
            toast.message("صف در حال اجراست؛ پنجره باز می‌ماند تا پایان یا توقف.");
            return;
          }
          setOpen(next);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تولید انبوه پاسخ تشریحی</DialogTitle>
            <DialogDescription>
              برای سوال‌های فعالِ بدون پاسخ تشریحی، صف تولید ساخته می‌شود. هر سوال از همان مسیر
              کش‌دارِ موجود عبور می‌کند و پاسخ‌های فعلی بازنویسی نمی‌شوند.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>دسته‌بندی</Label>
              <Select value={categoryId} onValueChange={setCategoryId} disabled={busy}>
                <SelectTrigger>
                  <SelectValue placeholder="همه دسته‌ها" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>همه دسته‌ها</SelectItem>
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
              <Select value={subjectId} onValueChange={setSubjectId} disabled={busy}>
                <SelectTrigger>
                  <SelectValue placeholder="همه درس‌ها" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>همه درس‌ها</SelectItem>
                  {(subjectsQ.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/30 p-4 text-sm">
            {pendingQ.isPending ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> در حال شمارش…
              </span>
            ) : pendingQ.isError ? (
              <span className="text-destructive">{humanizeError(pendingQ.error)}</span>
            ) : (
              <span>
                سوال‌های بدون پاسخ تشریحی:{" "}
                <strong>{(pendingQ.data?.pending ?? 0).toLocaleString("fa-IR")}</strong>
              </span>
            )}
          </div>

          {run.jobId && (
            <div className="space-y-3">
              <Progress value={percent} />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">
                  {run.index.toLocaleString("fa-IR")} از {total.toLocaleString("fa-IR")}
                </Badge>
                <Badge variant="default">موفق: {run.ok.toLocaleString("fa-IR")}</Badge>
                {run.failed > 0 && (
                  <Badge variant="destructive">خطا: {run.failed.toLocaleString("fa-IR")}</Badge>
                )}
                {run.status === "paused" && <Badge variant="outline">متوقف موقت</Badge>}
                {run.status === "done" && <Badge variant="outline">پایان</Badge>}
              </div>

              {run.errors.length > 0 && (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-3 text-xs">
                  {run.errors.slice(-30).map((e) => (
                    <p key={`${e.questionId}-${e.message}`} className="text-muted-foreground">
                      <span className="font-mono">{e.questionId.slice(0, 8)}</span> — {e.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            {busy ? (
              <>
                <Button variant="outline" onClick={cancelRun}>
                  <Square className="size-4" />
                  توقف کامل
                </Button>
                <Button variant="secondary" onClick={togglePause}>
                  {run.status === "paused" ? (
                    <>
                      <Play className="size-4" /> ادامه
                    </>
                  ) : (
                    <>
                      <Pause className="size-4" /> توقف موقت
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  بستن
                </Button>
                <Button
                  disabled={startMut.isPending || (pendingQ.data?.pending ?? 0) === 0}
                  onClick={() => startMut.mutate()}
                >
                  {startMut.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  شروع تولید
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export type { AiBatchJob };
