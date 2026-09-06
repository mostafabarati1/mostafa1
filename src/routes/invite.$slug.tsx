import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, Clock, ListChecks, ShieldCheck, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/data-states";
import { formatNumber, humanizeError } from "@/lib/format";
import { rpc } from "@/lib/supabase-rpc";
import { useAuth } from "@/hooks/use-auth";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ExamDetail } from "@/lib/types";

export const Route = createFileRoute("/invite/$slug")({
  head: () => ({
    meta: [
      { title: "دعوت به آزمون | همراه استخدام" },
      {
        name: "description",
        content:
          "با این دعوت‌نامه در آزمون استخدامی زمان‌دار همراه استخدام شرکت کنید و کارنامه تحلیلی بگیرید.",
      },
      { property: "og:title", content: "دعوت به آزمون | همراه استخدام" },
      {
        property: "og:description",
        content: "دعوت اختصاصی برای شرکت در آزمون استخدامی آنلاین همراه استخدام.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { slug } = Route.useParams();
  const { session, loading } = useAuth();

  const query = useQuery({
    queryKey: ["invite-exam", slug],
    queryFn: () => rpc<ExamDetail>("get_exam_public", { p_slug: slug }),
    retry: false,
  });

  return (
    <div className="relative min-h-dvh bg-muted/40 px-4 py-12" dir="rtl">
      <div className="absolute end-4 top-4">
        <ThemeToggle />
      </div>
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="text-center">
          <Badge variant="secondary" className="mb-3">
            دعوت‌نامه اختصاصی آزمون
          </Badge>
          <h1 className="text-2xl font-bold sm:text-3xl">
            {query.data?.title ?? "دعوت به آزمون همراه استخدام"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            برای شرکت در این آزمون، کافی است حساب خود را بسازید یا وارد شوید؛ یک هفته اشتراک هدیه هم
            پس از ثبت‌نام فعال می‌شود.
          </p>
        </div>

        {query.isLoading || loading ? (
          <LoadingState rows={3} />
        ) : query.isError ? (
          <Card>
            <CardHeader>
              <CardTitle>این آزمون در دسترس عمومی نیست</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>{humanizeError(query.error)}</p>
              <p>
                اگر این دعوت‌نامه برای شماست، ابتدا وارد حساب خود شوید؛ در صورت داشتن دسترسی، آزمون
                در فهرست «آزمون‌های من» نمایش داده می‌شود.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link to="/auth" search={{ returnTo: `/exam/${slug}` }}>
                    ورود یا ثبت‌نام
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/">صفحه اصلی</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : !query.data ? (
          <Card>
            <CardHeader>
              <CardTitle>آزمون یافت نشد</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>این لینک دعوت معتبر نیست یا آزمون حذف شده است.</p>
              <Button asChild>
                <Link to="/">بازگشت به صفحه اصلی</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{query.data.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {query.data.description && (
                <p className="text-sm text-muted-foreground">{query.data.description}</p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <InfoRow
                  icon={<Timer className="size-4" />}
                  label="مدت آزمون"
                  value={`${formatNumber(query.data.duration_minutes)} دقیقه`}
                />
                <InfoRow
                  icon={<ListChecks className="size-4" />}
                  label="تعداد سوال"
                  value={formatNumber(query.data.question_count ?? 0)}
                />
                <InfoRow
                  icon={<BookOpenCheck className="size-4" />}
                  label="نمره قبولی"
                  value={`${formatNumber(query.data.passing_score ?? 0)}٪`}
                />
                <InfoRow
                  icon={<Clock className="size-4" />}
                  label="محدودیت شرکت"
                  value="روزی یک بار"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild size="lg">
                  {session ? (
                    <Link to="/exam/$slug" params={{ slug }}>
                      ورود به صفحه آزمون
                    </Link>
                  ) : (
                    <Link to="/signup" search={{ returnTo: `/exam/${slug}` }}>
                      ثبت‌نام و شرکت در آزمون
                    </Link>
                  )}
                </Button>
                {!session && (
                  <Button asChild variant="outline" size="lg">
                    <Link to="/auth" search={{ returnTo: `/exam/${slug}` }}>
                      حساب دارم، وارد می‌شوم
                    </Link>
                  </Button>
                )}
              </div>

              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="size-4" />
                پاسخ‌ها به‌صورت خودکار ذخیره می‌شود و پس از پایان، کارنامه تحلیلی با پاسخ تشریحی
                هوشمند در اختیار شماست.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
