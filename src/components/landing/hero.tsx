import { Link } from "@tanstack/react-router";
import { Sparkles, Timer, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:py-20">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <Badge variant="secondary" className="mb-4 text-sm">
            بدون نیاز به اشتراک
          </Badge>
          <h1 className="text-3xl font-extrabold leading-tight md:text-5xl">
            قبولی استخدامی‌ات، از همین امروز شروع می‌شود.
          </h1>
          <p className="mt-4 text-base leading-8 text-muted-foreground md:text-lg">
            آزمون آزمایشی با ضرایب واقعی، توضیح هوش مصنوعی روی هر سؤال، و یک دفتر اشتباهات که هر روز
            کم‌تر می‌شود. یک هفته هدیه، بدون اشتراک.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/signup" search={{ intent: "trial", returnTo: "/dashboard" }}>
                شروع رایگان — یک هفته هدیه
              </Link>
            </Button>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-bl from-primary/15 via-primary/5 to-background p-6 md:p-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border bg-card/80 px-4 py-3 text-sm">
              <span className="inline-flex items-center gap-2 font-medium">
                <ClipboardList className="size-4 text-primary" />
                دفترچه عمومی — درس ریاضی
              </span>
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Timer className="size-4" />
                ۰۰:۴۵:۱۲
              </span>
            </div>
            <div className="rounded-xl border bg-card/80 p-4 text-sm leading-8">
              <p className="font-medium">
                نمونه سؤال: میانگین سه عدد متوالی ۲۱ است؛ بزرگ‌ترین عدد کدام است؟
              </p>
              <div className="mt-3 grid gap-2">
                {["۲۰", "۲۱", "۲۲", "۲۳"].map((o) => (
                  <div key={o} className="rounded-lg border px-3 py-2 text-muted-foreground">
                    {o}
                  </div>
                ))}
              </div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
              <Sparkles className="size-4 text-primary" />
              توضیح هوش مصنوعی روی همین سؤال
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
