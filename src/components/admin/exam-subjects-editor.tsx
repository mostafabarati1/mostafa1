import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { humanizeError } from "@/lib/format";
import { rpc } from "@/lib/supabase-rpc";
import { supabase } from "@/integrations/supabase/client";
import { adminExamDetailQuery, type AdminExamDetail } from "@/lib/admin/queries";

type Row = {
  subject_id: string;
  coefficient: number;
  question_count: number;
  time_limit_minutes: string;
  negative_marking: boolean;
};

const emptyRow: Row = {
  subject_id: "",
  coefficient: 1,
  question_count: 0,
  time_limit_minutes: "",
  negative_marking: false,
};

export function ExamSubjectsEditor({ examId }: { examId: string }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);

  const subjects = useQuery({
    queryKey: ["admin", "subjects-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name")
        .order("display_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 300_000,
  });

  const detail = useQuery(adminExamDetailQuery(examId));

  useEffect(() => {
    const d = detail.data as AdminExamDetail | undefined;
    if (!d) return;
    setRows(
      (d.subjects ?? []).map((s) => ({
        subject_id: s.subject_id,
        coefficient: Number(s.coefficient ?? 1),
        question_count: Number(s.question_count ?? 0),
        time_limit_minutes: s.time_limit_minutes != null ? String(s.time_limit_minutes) : "",
        negative_marking: Boolean(s.negative_marking),
      })),
    );
  }, [detail.data]);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = useMutation({
    mutationFn: async () => {
      const clean = rows.filter((r) => r.subject_id);
      const ids = new Set(clean.map((r) => r.subject_id));
      if (ids.size !== clean.length) throw new Error("هر درس فقط یک‌بار می‌تواند اضافه شود.");
      return rpc("set_exam_subjects", {
        p_exam_id: examId,
        p_rows: clean.map((r, i) => ({
          subject_id: r.subject_id,
          coefficient: r.coefficient || 1,
          question_count: r.question_count || 0,
          time_limit_minutes: r.time_limit_minutes.trim() || null,
          negative_marking: r.negative_marking,
          display_order: i,
        })),
      });
    },
    onSuccess: () => {
      toast.success("درس‌های آزمون ذخیره شد.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "exam", examId] });
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>درس‌های آزمون</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          ترتیب ردیف‌ها همان ترتیب نمایش درس‌ها در آزمون است. ضریب هر درس در نمره سوال‌های آن ضرب
          می‌شود و در صورت فعال بودن نمره منفی، برای هر پاسخ غلط یک‌سوم نمره کم می‌شود.
        </p>

        {rows.length === 0 && (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            هنوز درسی برای این آزمون تعریف نشده است.
          </p>
        )}

        {rows.map((r, i) => (
          <div key={i} className="grid gap-3 rounded-xl border p-3 md:grid-cols-6 md:items-end">
            <div className="space-y-2 md:col-span-2">
              <Label>درس</Label>
              <Select value={r.subject_id} onValueChange={(v) => update(i, { subject_id: v })}>
                <SelectTrigger aria-label="درس">
                  <SelectValue placeholder="انتخاب درس" />
                </SelectTrigger>
                <SelectContent>
                  {(subjects.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ضریب</Label>
              <Input
                type="number"
                min={0}
                step="0.25"
                value={r.coefficient}
                onChange={(e) => update(i, { coefficient: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>تعداد سوال</Label>
              <Input
                type="number"
                min={0}
                value={r.question_count}
                onChange={(e) => update(i, { question_count: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>زمان (دقیقه)</Label>
              <Input
                inputMode="numeric"
                value={r.time_limit_minutes}
                placeholder="اختیاری"
                onChange={(e) => update(i, { time_limit_minutes: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Switch
                  id={`neg-${i}`}
                  checked={r.negative_marking}
                  onCheckedChange={(v) => update(i, { negative_marking: v })}
                />
                <Label htmlFor={`neg-${i}`} className="text-xs">
                  نمره منفی
                </Label>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="حذف درس"
                onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setRows((p) => [...p, { ...emptyRow }])}
          >
            <Plus className="size-4" />
            افزودن درس
          </Button>
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            ذخیره درس‌ها
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
