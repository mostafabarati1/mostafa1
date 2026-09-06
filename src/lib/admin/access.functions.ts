import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "./require-admin";

export type AdminAccess = { ok: true; userId: string };

/**
 * تنها منبع تصمیم‌گیری برای دسترسی به مسیرهای مدیریتی.
 * اگر کاربر نشست نداشته باشد یا نقش admin نداشته باشد، روی سرور خطا می‌دهد.
 */
export const assertAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }): Promise<AdminAccess> => {
    return { ok: true, userId: context.userId };
  });
