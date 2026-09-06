import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin";
import type { ProofreadResult } from "@/lib/ai-proofread.types";

/**
 * بازبینی نگارشی سوال و گزینه‌ها.
 * فقط پیشنهاد برمی‌گرداند؛ هیچ نوشتنی روی `question_text` یا `option_text`
 * انجام نمی‌شود و اعمال هر اصلاح دستی است.
 */

const inputSchema = z.object({
  questionText: z.string().min(1).max(4000),
  options: z.array(z.string().max(1000)).min(1).max(10),
});

export const proofreadQuestion = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<ProofreadResult> => {
    const { proofreadQuestionContent } = await import("./ai-proofread.server");
    return proofreadQuestionContent({ questionText: data.questionText, options: data.options });
  });
