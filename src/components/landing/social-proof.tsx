import { Quote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";

const QUOTES = [
  {
    text: "بعد از سه هفته تمرین مداوم، درصد قبولی‌ام در آزمون آزمایشی از ۴۰ به ۶۵ رسید.",
    name: "داوطلب — تهران",
  },
  {
    text: "توضیح هوش مصنوعی روی هر سؤال، مثل داشتن معلم خصوصی بود.",
    name: "داوطلب — مشهد",
  },
  {
    text: "دفتر اشتباهات، دقیقاً همان چیزی بود که شب قبل آزمون به آن نیاز داشتم.",
    name: "داوطلب — شیراز",
  },
];

const STATS = [
  "+ کاربر فعال در سراسر کشور",
  "+ سؤال در بانک سوال",
  "+ سازمان برگزارکننده پوشش داده‌شده",
  "+ درس تخصصی",
];

export function SocialProof() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <SectionHeading title="تجربه‌ی داوطلبان" />
      <div className="grid gap-6 md:grid-cols-3">
        {QUOTES.map((q) => (
          <Card key={q.text} className="h-full">
            <CardContent className="space-y-3 py-6">
              <Quote className="size-6 text-primary" />
              <p className="text-sm leading-8">{q.text}</p>
              <p className="text-xs text-muted-foreground">{q.name}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-4 rounded-2xl border p-6 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s) => (
          <div key={s}>
            <p className="text-2xl font-extrabold text-primary">—</p>
            <p className="text-sm text-muted-foreground">{s}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        این ارقام پس از انتشار با KPI واقعی پُر می‌شوند.
      </p>
    </section>
  );
}
