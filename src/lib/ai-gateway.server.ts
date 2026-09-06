/**
 * تنها منبع حقیقت پیکربندی هوش مصنوعی (فقط سمت سرور).
 *
 * قواعد غیرقابل نقض:
 * - کلیدها فقط و فقط از متغیرهای محیطی خوانده می‌شوند (بدون هیچ fallback,
 *   mock یا مقدار ثابت در کد).
 * - انتخاب provider فقط با `AI_PROVIDER` انجام می‌شود؛ اگر کلیدِ همان provider
 *   موجود نباشد، خطای شفاف صادر می‌شود و به provider دیگری سوییچ نمی‌کنیم.
 * - مدل‌ها از `AI_MODEL` / `AI_EMBEDDING_MODEL` خوانده می‌شوند و در نبودشان از
 *   پیش‌فرض‌های همین لایهٔ مرکزی استفاده می‌شود (مدل، secret نیست).
 * - همه مقادیر داخل تابع خوانده می‌شوند (نه در module scope) تا در Worker
 *   مقدار زمانِ درخواست دیده شود.
 * - هیچ مقدار حساسی در پیام خطا یا لاگ چاپ نمی‌شود.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export type AiProviderKind = "lovable" | "gapgpt";

export const DEFAULT_AI_PROVIDER: AiProviderKind = "lovable";

type ProviderPreset = {
  baseURL: string;
  keyEnvName: string;
  defaultChatModel: string;
  defaultEmbeddingModel: string;
  buildHeaders: (apiKey: string) => Record<string, string>;
};

const PROVIDER_PRESETS: Record<AiProviderKind, ProviderPreset> = {
  lovable: {
    baseURL: "https://ai.gateway.lovable.dev/v1",
    keyEnvName: "LOVABLE_API_KEY",
    defaultChatModel: "google/gemini-3.7-flash",
    defaultEmbeddingModel: "openai/text-embedding-3-small",
    buildHeaders: (apiKey) => ({
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    }),
  },
  gapgpt: {
    baseURL: "https://api.gapgpt.app/v1",
    keyEnvName: "GAPGPT_API_KEY",
    defaultChatModel: "gpt-4o-mini",
    defaultEmbeddingModel: "text-embedding-3-small",
    buildHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
  },
};

export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export type AiRuntimeConfig = {
  kind: AiProviderKind;
  baseURL: string;
  headers: Record<string, string>;
  chatModel: string;
  embeddingModel: string;
};

function resolveProviderKind(): AiProviderKind {
  const raw = readEnv("AI_PROVIDER")?.toLowerCase();
  if (!raw) return DEFAULT_AI_PROVIDER;
  if (raw in PROVIDER_PRESETS) return raw as AiProviderKind;
  throw new AiConfigurationError(
    `پیکربندی هوش مصنوعی نامعتبر است: مقدار AI_PROVIDER پشتیبانی نمی‌شود (مقادیر مجاز: ${Object.keys(
      PROVIDER_PRESETS,
    ).join(" | ")}).`,
  );
}

/** پیکربندی فعال هوش مصنوعی؛ در نبود کلید، fail-fast با پیام امن. */
export function resolveAiConfig(): AiRuntimeConfig {
  const kind = resolveProviderKind();
  const preset = PROVIDER_PRESETS[kind];
  const apiKey = readEnv(preset.keyEnvName);

  if (!apiKey) {
    throw new AiConfigurationError(
      `سرویس هوش مصنوعی پیکربندی نشده است: متغیر محیطی ${preset.keyEnvName} تنظیم نشده است.`,
    );
  }

  return {
    kind,
    baseURL: readEnv("AI_BASE_URL") ?? preset.baseURL,
    headers: preset.buildHeaders(apiKey),
    chatModel: readEnv("AI_MODEL") ?? preset.defaultChatModel,
    embeddingModel: readEnv("AI_EMBEDDING_MODEL") ?? preset.defaultEmbeddingModel,
  };
}

/** فقط نام مدل چت فعال (بدون افشای هیچ کلیدی). */
export function getChatModel(): string {
  return resolveAiConfig().chatModel;
}

/** فقط نام مدل embedding فعال. */
export function getEmbeddingModel(): string {
  return resolveAiConfig().embeddingModel;
}

/** آیا سرویس هوش مصنوعی قابل استفاده است؟ (بدون پرتاب خطا) */
export function isAiConfigured(): boolean {
  try {
    resolveAiConfig();
    return true;
  } catch {
    return false;
  }
}

/** سازندهٔ provider سازگار با AI SDK بر اساس سرویس فعال. */
export function createAiProvider(config: AiRuntimeConfig = resolveAiConfig()) {
  return createOpenAICompatible({
    name: config.kind,
    baseURL: config.baseURL,
    supportsStructuredOutputs: true,
    headers: config.headers,
  });
}

/**
 * درخواست خام به endpoint سرویس فعال با هدرهای امن؛ نقطهٔ واحد ارسال کلید.
 * `path` باید با `/` شروع شود (مثل `/chat/completions`).
 */
export async function aiFetch(
  path: string,
  body: unknown,
  config: AiRuntimeConfig = resolveAiConfig(),
): Promise<Response> {
  return fetch(`${config.baseURL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...config.headers,
    },
    body: JSON.stringify(body),
  });
}
