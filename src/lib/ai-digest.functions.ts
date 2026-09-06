import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, type AnyClient } from "@/lib/admin/newsletter-shared";
import type { DigestRunSummary } from "@/lib/ai-digest.server";

/** اجرای دستی دیجست هفتگی از پنل مدیریت (همان مسیر cron). */
export const runWeeklyDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).default(50) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<DigestRunSummary> => {
    await assertAdmin(context.supabase as AnyClient);
    const { processWeeklyDigest } = await import("@/lib/ai-digest.server");
    return processWeeklyDigest(data.limit);
  });
