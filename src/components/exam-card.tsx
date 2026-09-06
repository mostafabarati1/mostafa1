import { Link } from "@tanstack/react-router";
import { Building2, CalendarDays, FileText, Layers, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatPrice } from "@/lib/format";
import type { PublicExam } from "@/lib/types";

const LEVELS: Record<string, string> = {
  easy: "آسان",
  medium: "متوسط",
  hard: "دشوار",
};

export function ExamCard({ exam, isAuthed }: { exam: PublicExam; isAuthed: boolean }) {
  const meta = [
    exam.organization_name && { icon: Building2, text: exam.organization_name },
    exam.category_name && { icon: Layers, text: exam.category_name },
    exam.year != null && { icon: CalendarDays, text: formatNumber(exam.year) },
  ].filter(Boolean) as { icon: typeof Building2; text: string }[];

  return (
    <article className="flex flex-col rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40">
      <div className="flex flex-wrap items-center gap-2">
        {exam.is_free ? (
          <Badge className="bg-success text-success-foreground">رایگان</Badge>
        ) : (
          <Badge variant="secondary">ویژه اشتراک</Badge>
        )}
        {exam.level && <Badge variant="outline">{LEVELS[exam.level] ?? exam.level}</Badge>}
      </div>

      <h3 className="mt-3 text-base font-bold leading-7 text-foreground">{exam.title}</h3>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {meta.map((m) => (
          <li key={m.text} className="inline-flex items-center gap-1">
            <m.icon className="size-3.5 shrink-0" aria-hidden="true" />
            {m.text}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-4 text-xs text-muted-foreground">
        <span className="num-fa inline-flex items-center gap-1">
          <FileText className="size-3.5" aria-hidden="true" />
          {formatNumber(exam.question_count)} سوال
        </span>
        <span className="num-fa inline-flex items-center gap-1">
          <Timer className="size-3.5" aria-hidden="true" />
          {formatNumber(exam.duration_minutes)} دقیقه
        </span>
      </div>

      <div className="mt-4">
        {isAuthed ? (
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to="/exam/$slug" params={{ slug: exam.slug }}>
              مشاهده جزئیات
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to="/auth" search={{ returnTo: `/exam/${exam.slug}` }}>
              ورود و مشاهده جزئیات
            </Link>
          </Button>
        )}
      </div>
    </article>
  );
}
