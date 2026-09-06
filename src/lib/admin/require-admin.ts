import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * میدل‌ور مرجعِ امنیتی برای همه Server Function های مدیریتی.
 *
 * ابتدا توکن Bearer روی سرور اعتبارسنجی می‌شود (requireSupabaseAuth) و سپس نقش
 * مدیر با RPC امنِ `is_admin` روی همان کلاینتِ کاربر (نه service role) بررسی
 * می‌شود. Guard سمت UI فقط برای تجربه کاربری است و مرجع نیست.
 */
export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase.rpc("is_admin");
    if (error) {
      console.error("[admin-guard] is_admin check failed:", error.message);
      throw new Error("Forbidden: admin check failed");
    }
    if (data !== true) {
      throw new Error("Forbidden: admin role required");
    }
    return next({ context: { isAdmin: true as const } });
  });
