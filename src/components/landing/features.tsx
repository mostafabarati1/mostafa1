import {
  BookOpen,
  CalendarClock,
  ClipboardList,
  Filter,
  Layers,
  LineChart,
  NotebookPen,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeading } from "@/components/section-heading";

const FEATURES = [
  {
    icon: ClipboardList,
    title: "آزمون آزمایشی واقع‌گرایانه، دقیقاً مثل روز واقعی.",
    text: "دفترچه‌های چندگانه با ضریب، نمره‌ی منفی اختیاری، ترتیب تصادفی سؤالات و گزینه‌ها، تایمر واقعی — همان چیزی که سر جلسه می‌بینی.",
  },
  {
    icon: Layers,
    title: "بانک سؤال سطح‌بندی‌شده، مسیر یادگیری‌ات را می‌سازد.",
    text: "از آسان شروع کن، هر وقت آماده بودی به متوسط و سخت برو. سطح سختی هر سؤال از ابتدا مشخص است.",
  },
  {
    icon: Sparkles,
    title: "توضیح هوش مصنوعی فارسی، روی هر سؤال.",
    text: "گیر کردی؟ روی سؤال مکث کن، توضیح کوتاه و کاربردی دریافت کن — بدون نیاز به معلم خصوصی.",
  },
  {
    icon: Filter,
    title: "تمرین با فیلتر دقیق، بی‌وقفه وقتت را هدر نده.",
    text: "فیلتر بر اساس سازمان برگزارکننده، دسته، درس و سطح سختی — فقط سؤال‌هایی که به کارت می‌خورد.",
  },
  {
    icon: LineChart,
    title: "تحلیل عملکرد شفاف، نه فقط یک نمره.",
    text: "روند پیشرفت، درصد قبولی، نقاط قوی و ضعیف، و مقایسه‌ی درس‌به‌درس.",
  },
  {
    icon: NotebookPen,
    title: "دفتر اشتباهات، همان چیزی که باید دوباره حل کنی.",
    text: "سؤالاتی که اشتباه جواب دادی، خودکار جمع می‌شود تا قبل از آزمون واقعی دوباره مرورشان کنی.",
  },
  {
    icon: BookOpen,
    title: "منابع یادگیری برای هر نقطه‌ضعف.",
    text: "هر موضوعی که در آن مشکل داری، یک پیشنهاد مطالعه، خلاصه یا ویدیو دارد.",
  },
  {
    icon: CalendarClock,
    title: "اشتراک منعطف، بدون تعهد بلندمدت.",
    text: "از آزمایشی یک‌هفته‌ای شروع کن، هر وقت آماده بودی پلن ماهانه، سه‌ماهه یا سالانه را انتخاب کن.",
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <SectionHeading
        title="چرا همراه استخدام؟"
        description="هر قابلیتی که می‌بینی، در پنل کاربری در دسترس است."
      />
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <Card key={title} className="h-full">
            <CardHeader>
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                <Icon className="size-6 text-primary" />
              </div>
              <CardTitle className="text-base leading-7">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-8 text-muted-foreground">{text}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
