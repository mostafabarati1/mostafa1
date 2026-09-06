import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";

const STEPS = [
  {
    title: "با شماره موبایل، در کم‌تر از یک دقیقه ثبت‌نام کن.",
    text: "فقط یک کد تأیید پیامکی، بدون رمز عبور طولانی.",
  },
  {
    title: "یک آزمون آزمایشی یا تمرین هدف‌دار انتخاب کن.",
    text: "از بین آزمون‌های موجود بر اساس سازمان، دسته یا سطح.",
  },
  {
    title: "سؤالات را حل کن، توضیح AI بگیر، اشتباهاتت را مرور کن.",
    text: "اشتباهاتت خودکار در دفتر اشتباهات ذخیره می‌شود.",
  },
  {
    title: "تحلیلت را ببین و برای آزمون بعدی بهتر شو.",
    text: "روند پیشرفت، عملکرد در هر درس، و پیشنهاد منابع مطالعه.",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <SectionHeading title="در چهار قدم، آماده‌ی روز واقعی می‌شوی." />
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <Card key={s.title} className="h-full">
            <CardHeader>
              <div className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {new Intl.NumberFormat("fa-IR").format(i + 1)}
              </div>
              <CardTitle className="text-base leading-7">{s.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-8 text-muted-foreground">{s.text}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
