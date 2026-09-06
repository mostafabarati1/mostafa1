import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Timer } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardsLoading, EmptyState, ErrorState, PageHeader } from "@/components/data-states";
import { formatDate, formatNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/my-exams")({
  head: () => ({
    meta: [
      { title: "آزمون‌های من | همراه استخدام" },
      { name: "description", content: "آزمون‌های اختصاص‌داده‌شده به شما" },
    ],
  }),
  component: MyExamsPage,
});

type Assigned = {
  id: string;
  exam: { id: string; title: string; slug: string; duration_minutes: number | null } | null;
} | null;

function MyExamsPage() {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const query = useQuery({
    queryKey: ["my-assignments", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_assignments")
        .select("id, exam:exams(id,title,slug,duration_minutes)")
        .eq("candidate_id", userId);
      if (error) throw error;
      return (data ?? []) as unknown as Assigned[];
    },
  });

  const assignments = (query.data ?? []).filter((a): a is NonNullable<Assigned> => !!a);

  return (
    <div>
      <PageHeader
        title="آزمون‌های من"
        description="آزمون‌های اختصاص‌داده‌شده به شما"
        actions={
          <Button asChild variant="outline">
            <Link to="/exams">
              <ArrowLeft className="size-4" />
              همه آزمون‌ها
            </Link>
          </Button>
        }
      />

      {query.isLoading ? (
        <CardsLoading />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : assignments.length === 0 ? (
        <EmptyState
          title="آزمونی به شما اختصاص داده نشده است"
          description="از فهرست عمومی آزمون‌ها می‌توانید آزمون شرکت کنید."
          action={
            <Button asChild size="sm">
              <Link to="/exams">مشاهده آزمون‌ها</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assignments.map((a) => (
            <Card key={a.id}>
              <CardContent className="space-y-3 py-5">
                <p className="font-semibold leading-7">{a.exam?.title ?? "—"}</p>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {a.exam?.duration_minutes != null && (
                    <span className="inline-flex items-center gap-1">
                      <Timer className="size-3.5" />
                      {formatNumber(a.exam.duration_minutes)} دقیقه
                    </span>
                  )}
                </div>
                {a.exam && (
                  <Button asChild size="sm" className="w-full">
                    <Link to="/exam/$slug" params={{ slug: a.exam.slug }}>
                      شروع آزمون
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
