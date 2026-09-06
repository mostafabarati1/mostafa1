import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, History } from "lucide-react";
import { getCoachHistory, type CoachHistoryReport } from "@/lib/ai-coach-history.functions";
import { LEVEL_LABELS_FA } from "@/lib/ai-coach.schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, humanizeError } from "@/lib/format";
import { cn } from "@/lib/utils";

function levelLabel(level: string | null) {
  if (!level) return null;
  return (LEVEL_LABELS_FA as Record<string, string | undefined>)[level] ?? level;
}

/** تاریخچهٔ گزارش‌های پیشین مربی هوشمند برای کاربر جاری. */
export function AiCoachHistory() {
  const run = useServerFn(getCoachHistory);
  const query = useQuery<CoachHistoryReport[]>({
    queryKey: ["ai-coach-history"],
    queryFn: () => run({ data: {} }),
  });

  if (query.isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="size-4 text-primary" />
            تاریخچه گزارش‌ها
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {humanizeError(query.error)}
      </p>
    );
  }

  const reports = query.data ?? [];
  if (reports.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="size-4 text-primary" />
          تاریخچه گزارش‌های قبلی
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {reports.map((r) => (
          <HistoryItem key={r.id} report={r} />
        ))}
      </CardContent>
    </Card>
  );
}

function HistoryItem({ report }: { report: CoachHistoryReport }) {
  const [open, setOpen] = useState(false);
  const weakTopics = report.summary?.weak_topics ?? [];
  const strengths = report.summary?.strengths ?? [];

  return (
    <div className="rounded-xl border bg-card p-3 text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-right"
        aria-expanded={open}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{report.headline || "بدون عنوان"}</span>
          {levelLabel(report.level) && <Badge variant="outline">{levelLabel(report.level)}</Badge>}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {formatDateTime(report.created_at)}
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </div>
      </button>
      {open && (
        <div className="mt-3 space-y-2 border-t pt-3 text-muted-foreground">
          {weakTopics.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground">نقاط ضعف ثبت‌شده:</p>
              <ul className="mt-1 list-inside list-disc space-y-1">
                {weakTopics.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {strengths.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground">نقاط قوت ثبت‌شده:</p>
              <ul className="mt-1 list-inside list-disc space-y-1">
                {strengths.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {weakTopics.length === 0 && strengths.length === 0 && (
            <p>جزئیات بیشتری برای این گزارش ثبت نشده است.</p>
          )}
        </div>
      )}
    </div>
  );
}
