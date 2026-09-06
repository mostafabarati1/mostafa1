import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Clock,
  Layers,
  ListChecks,
  Play,
  Tag,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState, ErrorState, PageHeader } from "@/components/data-states";
import { formatNumber, formatPrice, humanizeError } from "@/lib/format";
import { rpc } from "@/lib/supabase-rpc";
import { supabase } from "@/integrations/supabase/client";
import type { ExamDetail } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/exam/$slug/")({
  head: () => ({
    meta: [
      { title: "جزئیات آزمون | همراه استخدام" },
      { name: "description", content: "جزئیات و شروع آزمون استخدامی" },
    ],
  }),
  component: ExamDetailPage,
});

function ExamDetailPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["exam", slug],
    queryFn: () => rpc<ExamDetail>("get_exam_public", { p_slug: slug }),
  });

  const startExam = async () => {
    if (!query.data) return;
    setStarting(true);
    setStartError(null);
    try {
      const attemptId = await rpc<string>("start_attempt", {
        p_exam_id: query.data.id,
      });
      await navigate({
        to: "/exam/$slug/attempt",
        params: { slug },
        search: { attemptId },
      });
    } catch (e) {
      console.error("[startExam] start_attempt failed", e);
      setStartError(humanizeError(e) + (import.meta.env.DEV ? ` (raw: ${String(e)})` : ""));
    } finally {
      setStarting(false);
    }
  };

  if (query.isLoading) return <LoadingState rows={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const exam = query.data;
  if (!exam) return null;

  return (
    <div>
      <PageHeader
        title={exam.title}
        {...(exam.description ? { description: exam.description } : {})}
        actions={
          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="secondary">
                <Link to="/exam/$slug/practice" params={{ slug }}>
                  <ListChecks className="size-4" />
                  تمرین این آزمون
                </Link>
              </Button>
              <Button
                onClick={() => void startExam()}
                disabled={starting || exam.status !== "published"}
              >
                <Play className="size-4" />
                {starting ? "در حال شروع…" : "شروع آزمون"}
              </Button>
            </div>
            {exam.status !== "published" ? (
              <p className="text-xs text-muted-foreground">برای شروع، آزمون باید منتشر شود.</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                کاربران با اشتراک فعال می‌توانند بدون محدودیت در این آزمون شرکت کنند.
              </p>
            )}
          </div>
        }
      />

      {exam.status !== "published" && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-300/50 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="size-4 text-amber-600" />
          این آزمون فعلاً منتشر نشده است.
        </div>
      )}

      {startError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <span>{startError}</span>
          {startError.includes("اشتراک") && (
            <Button asChild size="sm" variant="outline">
              <Link to="/subscription">فعال‌سازی اشتراک</Link>
            </Button>
          )}
        </div>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          icon={<Timer className="size-5" />}
          label="مدت زمان"
          value={`${formatNumber(exam.duration_minutes)} دقیقه`}
        />
        <InfoCard
          icon={<Layers className="size-5" />}
          label="تعداد سوال"
          value={`${formatNumber(exam.question_count)} سوال`}
        />
        <InfoCard
          icon={<Tag className="size-5" />}
          label="نمره قبولی"
          value={exam.passing_score != null ? `${formatNumber(exam.passing_score)}` : "—"}
        />
        <InfoCard
          icon={<Play className="size-5" />}
          label="نوع دسترسی"
          value={exam.is_free ? "رایگان" : "ویژه اشتراک"}
        />
      </div>

      {(exam.organization || exam.category || exam.year || exam.level) && (
        <Card className="mb-5">
          <CardContent className="flex flex-wrap gap-2 py-4">
            {exam.organization && (
              <Badge variant="secondary">
                <Building2 className="size-3.5" /> {exam.organization.name}
              </Badge>
            )}
            {exam.category && (
              <Badge variant="secondary">
                <FolderIcon /> {exam.category.name}
              </Badge>
            )}
            {exam.year && (
              <Badge variant="secondary">
                <CalendarDays className="size-3.5" /> سال {formatNumber(exam.year)}
              </Badge>
            )}
            {exam.level && <Badge variant="secondary">{exam.level}</Badge>}
          </CardContent>
        </Card>
      )}

      {exam.subjects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4" />
              دروس آزمون
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-start text-muted-foreground">
                    <th className="py-2 text-start font-medium">درس</th>
                    <th className="py-2 text-start font-medium">تعداد سوال</th>
                    <th className="py-2 text-start font-medium">ضریب</th>
                  </tr>
                </thead>
                <tbody>
                  {exam.subjects.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2">{s.name}</td>
                      <td className="py-2">{formatNumber(s.question_count)}</td>
                      <td className="py-2">{formatNumber(s.coefficient)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function FolderIcon() {
  return <Layers className="size-3.5" />;
}
