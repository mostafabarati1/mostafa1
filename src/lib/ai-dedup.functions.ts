import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin";
import type { SemanticDedupResult, SemanticDuplicateMatch } from "@/lib/ai-dedup.types";

/**
 * تشخیص تکرار معنایی سوالات ورودی فایل با embedding.
 * این قابلیت کاملاً اختیاری و مکمل جریان فعلی fingerprint/RPC است؛
 * هر خطا (کلید API، سرویس embeddings، افزونه vector یا جدول embedding) باعث
 * غیرفعال‌شدن نرم قابلیت می‌شود و هرگز جریان اصلی ورود را متوقف نمی‌کند.
 */

const rowSchema = z.object({
  row_number: z.number().int().nonnegative(),
  question_text: z.string().min(1),
  options: z.array(z.string()).min(1),
});

const inputSchema = z.object({
  rows: z.array(rowSchema).min(1).max(300),
});

const DISABLED_REASON = "غیرفعال";

function disabled(reason: string = DISABLED_REASON): SemanticDedupResult {
  return { enabled: false, reason, matches: [], threshold: 0.92, model: "" };
}

export const detectSemanticDuplicates = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<SemanticDedupResult> => {
    try {
      const { createEmbeddings, cosineSimilarity, buildQuestionEmbeddingText } =
        await import("./ai-embed.server");

      const { getEmbeddingModel } = await import("./ai-gateway.server");
      let model = getEmbeddingModel();
      let threshold = 0.92;
      const settingsRes = (await context.supabase.rpc(
        "admin_ai_dedup_settings" as never,
        {} as never,
      )) as { error: unknown; data: unknown };
      if (!settingsRes.error && settingsRes.data) {
        const settings = settingsRes.data as { model?: string; threshold?: number };
        if (typeof settings["model"] === "string" && settings["model"]) model = settings["model"];
        if (typeof settings["threshold"] === "number" && settings["threshold"] > 0) {
          threshold = settings["threshold"];
        }
      }

      const texts = data.rows.map((r) => buildQuestionEmbeddingText(r.question_text, r.options));
      const embeddings = await createEmbeddings(texts, model);
      if (embeddings.length !== data.rows.length) return disabled();

      const matches: SemanticDuplicateMatch[] = [];

      // مقایسه‌ی درون همان فایل
      for (let i = 0; i < data.rows.length; i += 1) {
        for (let j = i + 1; j < data.rows.length; j += 1) {
          const embA = embeddings[i];
          const embB = embeddings[j];
          if (!embA || !embB) continue;
          const similarity = cosineSimilarity(embA, embB);
          if (similarity >= threshold) {
            const rowI = data.rows[i];
            const rowJ = data.rows[j];
            if (!rowI || !rowJ) continue;
            matches.push({
              row_number: rowJ.row_number,
              existing_question_id: null,
              matched_row_number: rowI.row_number,
              existing_question_text: rowI.question_text,
              similarity,
              source: "batch",
            });
          }
        }
      }

      // مقایسه با سوالات فعال بانک سوال از طریق RPC امن
      const searchRes = await context.supabase.rpc(
        "admin_search_similar_questions_batch" as never,
        {
          p_rows: data.rows.map((r, i) => ({ row_number: r.row_number, embedding: embeddings[i] })),
          p_threshold: threshold,
          p_limit_per_row: 3,
        } as never,
      );
      if (searchRes.error) return disabled();

      const dbMatches = (searchRes.data ?? []) as unknown as {
        row_number: number;
        question_id: string;
        question_text: string;
        similarity: number;
      }[];
      for (const m of dbMatches) {
        matches.push({
          row_number: m.row_number,
          existing_question_id: m.question_id,
          matched_row_number: null,
          existing_question_text: m.question_text,
          similarity: m.similarity,
          source: "database",
        });
      }

      return { enabled: true, reason: null, matches, threshold, model };
    } catch {
      return disabled();
    }
  });
