import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/server-env";

/**
 * نقشه سایت عمومی (افزودنی — هیچ مسیر موجودی تغییر نکرده است).
 * فقط صفحات عمومی و قابل ایندکس فهرست می‌شوند: خانه، اخبار، فروشگاه
 * به‌همراه صفحات جزئیات خبر و محصول منتشرشده.
 */

const BASE_URL = "https://rtl-exam-genius.lovable.app";

const STATIC_PATHS = ["/", "/news", "/shop"];

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

function isSafePath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\\]/.test(path)) return false;
  try {
    return decodeURI(new URL(path, "https://sitemap.invalid").pathname) === decodeURI(path);
  } catch {
    return false;
  }
}

function escapeXML(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
  );
}

function buildXML(paths: string[]): string {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const path of paths) {
    if (!isSafePath(path)) continue;
    const href = new URL(path, BASE_URL).href;
    if (seen.has(href)) continue;
    seen.add(href);
    urls.push(`<url><loc>${escapeXML(href)}</loc></url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function collectNewsPaths(supabase: any): Promise<string[]> {
  const paths: string[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; ) {
    const { data, error } = await supabase
      .from("news")
      .select("slug")
      .eq("status", "published")
      .not("slug", "is", null)
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { slug: string | null }[];
    if (rows.length === 0) break;
    for (const row of rows) {
      if (row.slug) paths.push(`/news/${encodeURIComponent(row.slug)}`);
    }
    offset += rows.length;
    if (rows.length < pageSize) break;
  }
  return paths;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function collectShopPaths(supabase: any): Promise<string[]> {
  const paths: string[] = [];
  const pageSize = 200;
  for (let offset = 0; ; ) {
    const { data, error } = await supabase.rpc("shop_list_products", {
      p_search: null,
      p_category_id: null,
      p_limit: pageSize,
      p_offset: offset,
    });
    if (error) throw new Error(error.message);
    const items = (data?.items ?? []) as { slug?: string | null }[];
    if (items.length === 0) break;
    for (const item of items) {
      if (item.slug) paths.push(`/shop/${encodeURIComponent(item.slug)}`);
    }
    offset += items.length;
    if (items.length < pageSize) break;
  }
  return paths;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const supabase = publicClient();
          const [newsPaths, shopPaths] = await Promise.all([
            collectNewsPaths(supabase),
            collectShopPaths(supabase),
          ]);
          const xml = buildXML([...STATIC_PATHS, ...newsPaths, ...shopPaths]);
          return new Response(xml, {
            headers: {
              "Content-Type": "application/xml",
              "Cache-Control": "public, max-age=3600",
            },
          });
        } catch (error) {
          console.error(error);
          return new Response("Sitemap unavailable", {
            status: 503,
            headers: { "Cache-Control": "no-store" },
          });
        }
      },
    },
  },
});
