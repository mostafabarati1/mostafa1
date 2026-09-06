import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/data-states";
import { AiCoachCard } from "@/components/ai-coach-card";
import { AiCoachHistory } from "@/components/ai-coach-history";

export const Route = createFileRoute("/_authenticated/coach")({
  head: () => ({
    meta: [
      { title: "مربی هوشمند مطالعه | همراه استخدام" },
      {
        name: "description",
        content: "تحلیل هوشمند کارنامه آزمون‌ها، شناسایی نقاط ضعف و برنامه مطالعه شخصی‌سازی‌شده.",
      },
      { property: "og:title", content: "مربی هوشمند مطالعه" },
      {
        property: "og:description",
        content: "تحلیل هوشمند کارنامه و برنامه مطالعه شخصی بر اساس نتایج واقعی آزمون‌های شما.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CoachPage,
});

function CoachPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="مربی هوشمند مطالعه"
        description="تحلیل کارنامه شما با هوش مصنوعی و ارائه برنامه مطالعه شخصی‌سازی‌شده"
      />
      <AiCoachCard />
      <AiCoachHistory />
    </div>
  );
}
