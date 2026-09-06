import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";

const PLANS = [
  {
    key: "trial",
    title: "آزمایشی",
    duration: "یک هفته (هدیه)",
    audience: "اولین آشنایی با سامانه",
    badge: "رایگان",
  },
  {
    key: "monthly",
    title: "ماهانه",
    duration: "۳۰ روز",
    audience: "آمادگی برای یک آزمون مشخص",
  },
  {
    key: "quarterly",
    title: "سه‌ماهه",
    duration: "۹۰ روز",
    audience: "برنامه‌ی تمرین منظم",
    note: "سودمند برای دوره‌ی آمادگی طولانی‌تر",
  },
  {
    key: "yearly",
    title: "سالانه",
    duration: "۳۶۵ روز",
    audience: "داوطلبان جدی با چند آزمون",
    badge: "پیشنهاد ویژه",
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-4 py-12">
      <SectionHeading title="شروع رایگان، ارتقا وقتی آماده بودی." />
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => (
          <Card key={p.key} className="flex h-full flex-col">
            <CardHeader>
              {p.badge && (
                <Badge variant={p.key === "trial" ? "secondary" : "default"} className="w-fit">
                  {p.badge}
                </Badge>
              )}
              <CardTitle className="text-base">{p.title}</CardTitle>
              <p className="text-sm text-muted-foreground">مدت: {p.duration}</p>
            </CardHeader>
            <CardContent className="mt-auto space-y-3">
              <p className="text-sm text-muted-foreground">مناسب برای: {p.audience}</p>
              {p.key === "trial" ? (
                <Button asChild className="w-full">
                  <Link to="/signup" search={{ intent: "trial", returnTo: "/dashboard" }}>
                    دریافت هدیه
                  </Link>
                </Button>
              ) : (
                <Button className="w-full" variant="outline" disabled>
                  در حال بارگذاری…
                </Button>
              )}
              {p.note && <p className="text-xs text-muted-foreground">{p.note}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-xs leading-7 text-muted-foreground">
        قیمت‌ها در صفحه‌ی پرداخت به‌روز است. فعال‌سازی هدیه با کلیک روی «دریافت هدیه»؛ فیلد
        has_used_trial در پروفایل پس از فعال‌سازی true می‌شود.
      </p>
    </section>
  );
}
