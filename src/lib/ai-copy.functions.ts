import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin";

/**
 * تولید پیش‌نویس متن کمپین (پیامک/ایمیل).
 * فقط متن برمی‌گرداند؛ هیچ ارسالی انجام نمی‌شود و منطق ارسال موجود دست‌نخورده است.
 */

const inputSchema = z.object({
  kind: z.enum(["sms", "email"]),
  topic: z.string().min(3).max(500),
  tone: z.string().max(100).nullable().optional(),
  audience: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export type CampaignCopy = { text: string | null; subject: string | null; body: string | null };

export const generateCampaignCopy = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<CampaignCopy> => {
    const { generateCampaignCopyText } = await import("./ai-copy.server");
    return generateCampaignCopyText({
      kind: data.kind,
      topic: data.topic,
      tone: data.tone ?? null,
      audience: data.audience ?? null,
      notes: data.notes ?? null,
    });
  });
