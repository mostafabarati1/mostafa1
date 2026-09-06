/**
 * رتبه‌بندی هوشمند منابع پیشنهادی بر اساس نقاط ضعف داوطلب (فقط سمت سرور).
 *
 * یک فراخوانی سبک هوش مصنوعی؛ خروجی با zod اعتبارسنجی می‌شود و شناسه‌های
 * خارج از فهرست ورودی حذف می‌شوند. در صورت هر خطا یا timeout، به‌صورت
 * بی‌صدا همان آرایه ورودی بدون تغییر برگردانده می‌شود (رفتار فعلی حفظ می‌شود).
 */

import { z } from "zod";
import type { LearningResource } from "./ai-coach.schema";

const rankedItemSchema = z.object({
  id: z.string(),
  why: z.string().min(1),
});

const rankedOutputSchema = z.array(rankedItemSchema);

export type RankedResource = { id: string; why: string };

const TIMEOUT_MS = 8000;

function buildPrompt(weaknesses: string[], resources: LearningResource[]): string {
  return [
    "نقاط ضعف داوطلب (فارسی):",
    JSON.stringify(weaknesses),
    "",
    "منابع مجاز (فقط از همین id ها استفاده کن):",
    JSON.stringify(
      resources.map((r) => ({ id: r.id, title: r.title, type: r.type, topic: r.topic })),
    ),
    "",
    'خروجی را فقط به‌صورت آرایه JSON از اشیای {"id": "...", "why": "..."} بده؛',
    "id باید دقیقاً از میان منابع مجاز باشد و why یک توضیح کوتاه فارسی باشد که",
    "توضیح دهد این منبع چگونه به رفع کدام نقطه ضعف کمک می‌کند. منابعی که ارتباط ندارند را حذف کن.",
  ].join("\n");
}

/**
 * منابع را بر اساس نقاط ضعف داوطلب رتبه‌بندی/توضیح‌گذاری می‌کند.
 * در صورت هر مشکلی، همان `resources` ورودی بدون تغییر برگردانده می‌شود.
 */
export async function rankResources(
  weaknesses: string[],
  resources: LearningResource[],
): Promise<LearningResource[]> {
  if (resources.length === 0 || weaknesses.length === 0) return resources;

  try {
    const { generateAdminJson } = await import("./ai-admin/gapgpt.server");
    const allowedIds = new Set(resources.map((r) => r.id));

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
    });

    const raw = await Promise.race([
      generateAdminJson(
        "تو دستیار رتبه‌بندی منابع آموزشی فارسی هستی و فقط خروجی JSON معتبر تولید می‌کنی.",
        buildPrompt(weaknesses, resources),
      ),
      timeout,
    ]);

    const arr = Array.isArray(raw) ? raw : (raw as { items?: unknown })?.["items"];
    const parsed = rankedOutputSchema.parse(arr);
    const filtered = parsed.filter((r) => allowedIds.has(r.id));
    if (filtered.length === 0) return resources;

    const byId = new Map(resources.map((r) => [r.id, r]));
    const rankedIds = new Set(filtered.map((r) => r.id));
    const ranked: LearningResource[] = [];
    for (const r of filtered) {
      const base = byId.get(r.id);
      if (base) ranked.push({ ...base, description: r.why });
    }
    const rest = resources.filter((r) => !rankedIds.has(r.id));
    return [...ranked, ...rest];
  } catch {
    return resources;
  }
}
