import { z } from "zod";

/**
 * کمکی‌های مشترک خبرنامه — جدا از فایل‌های server function نگه داشته می‌شوند
 * تا در بیلد تولیدی (code splitting) حذف نشوند.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyClient = any;

export async function assertAdmin(supabase: AnyClient) {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("دسترسی مدیر لازم است");
}

export function slugify(input: string): string {
  return input
    .trim()
    .replace(/[\u200c\s]+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120)
    .toLowerCase();
}

export const SUBSCRIBER_COLUMNS = "id,email,name,source,status,user_id,created_at";

export const subscriberListSchema = z.object({
  q: z.string().trim().max(160).optional(),
  status: z.enum(["all", "pending", "active", "unsubscribed", "bounced"]).default("all"),
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(1).max(200).default(25),
});

export const newsInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(200),
  slug: z.string().trim().max(160).optional().nullable(),
  summary: z.string().trim().max(600).optional().nullable(),
  body: z.string().trim().max(50_000).optional().nullable(),
  status: z.enum(["draft", "scheduled", "published", "archived"]),
  is_important: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  category_id: z.string().uuid().nullable().optional(),
  cover_url: z.string().trim().url().max(500).nullable().optional(),
  source_url: z.string().trim().url().max(500).nullable().optional(),
  seo_title: z.string().trim().max(160).nullable().optional(),
  seo_description: z.string().trim().max(300).nullable().optional(),
  scheduled_at: z.string().datetime({ offset: true }).nullable().optional(),
  channels: z
    .object({ site: z.boolean(), in_app: z.boolean(), sms: z.boolean(), email: z.boolean() })
    .default({ site: true, in_app: true, sms: false, email: false }),
});

export const listNewsInput = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["all", "draft", "scheduled", "published", "archived"]).default("all"),
  limit: z.number().int().min(1).max(100).default(50),
});
