import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, EmptyState, ErrorState, PageHeader } from "@/components/data-states";
import { formatDate, humanizeError } from "@/lib/format";
import { rpc } from "@/lib/supabase-rpc";

export const Route = createFileRoute("/admin/reports-questions")({
  head: () => ({
    meta: [
      { title: "گزارش سوالات | همراه استخدام" },
      { name: "description", content: "بررسی گزارش‌های ثبت‌شده روی سوالات" },
    ],
  }),
  component: QuestionReportsPage,
});

type Report = {
  id: string;
  question_id: string;
  question_text: string;
  reporter_name: string;
  reason: string;
  description: string | null;
  admin_note: string | null;
  status: string;
  created_at: string;
};

function QuestionReportsPage() {
  const qc = useQueryClient();
  const [reviewing, setReviewing] = useState<Report | null>(null);

  const query = useQuery({
    queryKey: ["admin-question-reports"],
    queryFn: () => rpc<Report[]>("list_question_reports"),
  });

  const updateMut = useMutation({
    mutationFn: async (v: { id: string; status: string; admin_note: string | null }) => {
      const { error } = await supabase
        .from("question_reports")
        .update({ status: v.status, admin_note: v.admin_note })
        .eq("id", v.id);
      if (error) throw error;
      return null;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-question-reports"] });
      setReviewing(null);
    },
  });

  const rows = query.data ?? [];

  return (
    <div>
      <PageHeader title="گزارش سوالات" description="بررسی گزارش‌های نادرستی سوالات" />

      {query.isLoading ? (
        <LoadingState rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="گزارشی ثبت نشده است" description="در حال حاضر گزارشی وجود ندارد." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Badge
                    variant={
                      r.status === "resolved"
                        ? "default"
                        : r.status === "pending"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {r.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(r.created_at)}</span>
                </div>
                <CardTitle className="line-clamp-2 text-base">{r.question_text}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">دلیل: </span>
                  {r.reason}
                </p>
                {r.description && (
                  <p>
                    <span className="text-muted-foreground">توضیحات: </span>
                    {r.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">گزارش‌دهنده: {r.reporter_name}</p>
                <Button size="sm" variant="outline" onClick={() => setReviewing(r)}>
                  بررسی
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>بررسی گزارش سوال</DialogTitle>
            <DialogDescription>وضعیت گزارش و یادداشت مدیر را ثبت کنید.</DialogDescription>
          </DialogHeader>
          {reviewing && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const note = new FormData(e.currentTarget).get("note") as string;
                updateMut.mutate({
                  id: reviewing.id,
                  status: "resolved",
                  admin_note: note || null,
                });
              }}
            >
              <p className="text-sm">
                <span className="text-muted-foreground">دلیل: </span>
                {reviewing.reason}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">توضیحات: </span>
                {reviewing.description ?? "—"}
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium">یادداشت مدیر</label>
                <Textarea
                  name="note"
                  defaultValue={reviewing.admin_note ?? ""}
                  placeholder="توضیح اقدام انجام‌شده…"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setReviewing(null)}>
                  انصراف
                </Button>
                <Button type="submit" disabled={updateMut.isPending}>
                  {updateMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "بستن گزارش"}
                </Button>
              </DialogFooter>
            </form>
          )}
          {updateMut.isError && (
            <p className="text-sm text-destructive">{humanizeError(updateMut.error)}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
