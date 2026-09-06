import { generateText, Output } from "ai";
import { createAiProvider, resolveAiConfig } from "./ai-gateway.server";
import {
  coachAnalysisSchema,
  type AnalyticsPayload,
  type CoachAnalysis,
  type LearningResource,
  type PreviousReportSummary,
} from "./ai-coach.schema";
const SYSTEM_PROMPT = `تو یک مربی آموزشی فارسی‌زبان برای داوطلبان آزمون‌های استخدامی هستی.
قواعد سخت:
- فقط و فقط بر اساس داده‌های JSON داده‌شده تحلیل کن. هیچ عدد، مبحث، آزمون یا منبعی را از خودت نساز.
- در recommended_resources فقط از منابعی استفاده کن که در فهرست allowed_resources آمده‌اند و باید id را دقیقاً همان مقدار بگذاری. اگر فهرست خالی است، این آرایه را خالی بگذار.
- اگر داده کافی نیست (تعداد آزمون یا پاسخ صفر/کم)، level را insufficient_data بگذار و کاربر را به شرکت در آزمون تشویق کن.
- همه متن‌ها فارسی، محترمانه، کوتاه و عملی باشند. از تشخیص پزشکی/روانی و وعده قطعی قبولی پرهیز کن.
- زمان‌بندی هر گام مطالعه را واقع‌بینانه و بر حسب دقیقه بده.
- اگر «گزارش قبلی» داده شده، تحلیل جدید را با توجه به روند پیشرفت نسبت به آن گزارش تطبیقی و مقایسه‌ای بنویس (بهبود یا تکرار نقاط ضعف را صریح ذکر کن).`;
function buildUserPrompt(
  analytics: AnalyticsPayload,
  resources: LearningResource[],
  previousReport?: PreviousReportSummary | null,
) {
  const parts = [
    "داده‌های تحلیلی کارنامه داوطلب (JSON):",
    JSON.stringify(analytics),
    "",
    "allowed_resources (JSON، تنها منابع مجاز برای پیشنهاد):",
    JSON.stringify(
      resources.map((r) => ({ id: r.id, title: r.title, type: r.type, topic: r.topic })),
    ),
  ];
  if (previousReport) {
    parts.push("", "گزارش قبلی (JSON، برای مقایسه روند پیشرفت):", JSON.stringify(previousReport));
  }
  parts.push("", "بر اساس همین داده‌ها یک تحلیل و برنامه مطالعه شخصی‌سازی‌شده فارسی تولید کن.");
  return parts.join("\n");
}
export async function generateCoachAnalysis(
  analytics: AnalyticsPayload,
  resources: LearningResource[],
  previousReport?: PreviousReportSummary | null,
): Promise<CoachAnalysis> {
  const config = resolveAiConfig();
  const gateway = createAiProvider(config);
  const allowedIds = new Set(resources.map((r) => r.id));
  const { experimental_output: output } = await generateText({
    model: gateway(config.chatModel),
    system: SYSTEM_PROMPT,
    prompt: buildUserPrompt(analytics, resources, previousReport),
    experimental_output: Output.object({ schema: coachAnalysisSchema }),
  });
  const parsed = coachAnalysisSchema.parse(output);
  return {
    ...parsed,
    recommended_resources: parsed.recommended_resources.filter((r) => allowedIds.has(r.id)),
  };
}
