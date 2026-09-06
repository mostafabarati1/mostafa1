import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/server-env";

/**
 * خواندن عمومی اخبار استخدامی (SSR-safe).
 *
 * از کلید publishable و سیاست «news public read published» استفاده می‌شود؛
 * هیچ کلید سرویس‌رول و هیچ داده کاربری در این مسیر دخیل نیست.
 */

export type PublicNewsItem = {
  id: string;
  title: string;
  slug: string | null;
  summary: string | null;
  cover_url: string | null;
  published_at: string | null;
  is_important: boolean;
  tags: string[];
  category_id: string | null;
  category_name: string | null;
};

export type PublicNewsDetail = PublicNewsItem & {
  body: string | null;
  seo_title: string | null;
  seo_description: string | null;
  source_url: string | null;
};

export type NewsListResult = {
  items: PublicNewsItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type NewsCategory = { id: string; name: string; slug: string | null };

const NEWS_COLUMNS =
  "id,title,slug,summary,cover_url,published_at,is_important,tags,category_id,categories(name)";

type RawNewsRow = {
  id: string;
  title: string;
  slug: string | null;
  summary: string | null;
  cover_url: string | null;
  published_at: string | null;
  is_important: boolean | null;
  tags: string[] | null;
  category_id: string | null;
  categories: { name: string } | { name: string }[] | null;
  body?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  source_url?: string | null;
};

function mapRow(row: RawNewsRow): PublicNewsItem {
  const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    cover_url: row.cover_url,
    published_at: row.published_at,
    is_important: Boolean(row.is_important),
    tags: row.tags ?? [],
    category_id: row.category_id,
    category_name: category?.name ?? null,
  };
}

/**
 * کلاینت publishable مخصوص سرور (بدون نگه‌داشتن نشست).
 *
 * جداول خبرنامه هنوز در `src/integrations/supabase/types.ts` تولید نشده‌اند،
 * بنابراین—مانند `src/lib/newsletter-db.ts`—فقط برای همین جداول از ارجاع
 * بدون تایپ استفاده می‌کنیم و اعتبارسنجی خروجی را دستی انجام می‌دهیم.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function publicClient(): any {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  return createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

const listSchema = z.object({
  q: z.string().trim().max(120).optional(),
  categoryId: z.string().uuid().optional(),
  page: z.number().int().min(1).max(500).default(1),
  pageSize: z.number().int().min(1).max(50).default(12),
});

export const listPublicNews = createServerFn({ method: "GET" })
  .validator((input: unknown) => listSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<NewsListResult> => {
    const supabase = publicClient();
    const from = (data.page - 1) * data.pageSize;

    let query = supabase
      .from("news")
      .select(NEWS_COLUMNS, { count: "exact" })
      .eq("status", "published")
      .order("is_important", { ascending: false })
      .order("published_at", { ascending: false })
      .range(from, from + data.pageSize - 1);

    if (data.categoryId) query = query.eq("category_id", data.categoryId);
    if (data.q) {
      const term = data.q.replace(/[%,()]/g, " ").trim();
      if (term) query = query.or(`title.ilike.%${term}%,summary.ilike.%${term}%`);
    }

    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);

    return {
      items: ((rows ?? []) as unknown as RawNewsRow[]).map(mapRow),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

export const getPublicNewsBySlug = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ slug: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }): Promise<PublicNewsDetail | null> => {
    const supabase = publicClient();
    const { data: row, error } = await supabase
      .from("news")
      .select(`${NEWS_COLUMNS},body,seo_title,seo_description,source_url`)
      .eq("status", "published")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;

    const raw = row as unknown as RawNewsRow;
    return {
      ...mapRow(raw),
      body: raw.body ?? null,
      seo_title: raw.seo_title ?? null,
      seo_description: raw.seo_description ?? null,
      source_url: raw.source_url ?? null,
    };
  });

export const listNewsCategories = createServerFn({ method: "GET" }).handler(
  async (): Promise<NewsCategory[]> => {
    const supabase = publicClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id,name,slug")
      .order("name", { ascending: true })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as NewsCategory[];
  },
);
