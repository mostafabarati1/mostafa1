import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/server-env";

/**
 * خواندن عمومی محصول فروشگاه برای متادیتای SSR (عنوان، توضیح و پیش‌نمایش اشتراک‌گذاری).
 * فقط با کلید publishable و بدون نگه‌داشتن نشست کاربر.
 */

export type PublicProductSeo = {
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  image: string | null;
  meta_title: string | null;
  meta_description: string | null;
  in_stock: boolean;
};

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

const slugSchema = z.object({ slug: z.string().trim().min(1).max(200) });

export const getPublicProductSeo = createServerFn({ method: "GET" })
  .validator((input: unknown) => slugSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<PublicProductSeo | null> => {
    const supabase = publicClient();
    const { data: row, error } = await supabase.rpc("shop_get_product", { p_slug: data.slug });
    if (error) return null;
    if (!row || typeof row !== "object") return null;

    const images = Array.isArray(row.images) ? (row.images as string[]) : [];
    return {
      title: String(row.title ?? ""),
      slug: String(row.slug ?? data.slug),
      summary: row.summary ?? null,
      description: row.description ?? null,
      price: typeof row.price === "number" ? row.price : null,
      currency: row.currency ?? null,
      image: images[0] ?? null,
      meta_title: row.meta_title ?? null,
      meta_description: row.meta_description ?? null,
      in_stock: Boolean(row.stock_unlimited) || Number(row.stock ?? 0) > 0,
    };
  });
