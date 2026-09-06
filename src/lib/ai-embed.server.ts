/**
 * فراخوانی سرویس embeddings (فقط سمت سرور) برای تشخیص تکرار معنایی سوالات.
 * پیکربندی از لایهٔ مرکزی `ai-gateway.server` (فقط env) خوانده می‌شود.
 */

import { aiFetch, getEmbeddingModel, resolveAiConfig } from "./ai-gateway.server";

/** مدل embedding فعال؛ فقط از پیکربندی مرکزی env-driven. */
export { getEmbeddingModel };
export const EMBEDDING_DIMENSIONS = 1536;

type EmbeddingItem = { embedding: number[]; index: number };
type EmbeddingsResponse = { data?: EmbeddingItem[] };

/** یک درخواست embeddings برای چند متن هم‌زمان؛ ترتیب خروجی با ترتیب ورودی یکسان است. */
export async function createEmbeddings(texts: string[], model?: string): Promise<number[][]> {
  if (texts.length === 0) return [];

  const config = resolveAiConfig();
  const effectiveModel = model && model.trim().length > 0 ? model.trim() : config.embeddingModel;

  const response = await aiFetch("/embeddings", { model: effectiveModel, input: texts }, config);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`خطای سرویس embeddings (${response.status}): ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as EmbeddingsResponse;
  const items = payload.data;
  if (!Array.isArray(items) || items.length !== texts.length) {
    throw new Error("پاسخ نامعتبر از سرویس embeddings دریافت شد.");
  }

  return items
    .slice()
    .sort((a, b) => a["index"] - b["index"])
    .map((item) => item["embedding"]);
}

/** شباهت کسینوسی دو بردار هم‌طول. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** متن یکپارچه‌ی سوال+گزینه‌ها برای ورودی مدل embedding. */
export function buildQuestionEmbeddingText(questionText: string, options: string[]): string {
  return `${questionText.trim()} :: ${options.map((o) => o.trim()).join(" | ")}`;
}
