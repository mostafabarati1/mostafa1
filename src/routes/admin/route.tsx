import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/admin-shell";
import { assertAdminAccess } from "@/lib/admin/access.functions";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    // ۱) نشست کاربر (فقط برای تصمیم redirect؛ مرجع امنیتی نیست).
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // ۲) مرجع امنیتی: بررسی نقش مدیر روی سرور با توکن Bearer.
    //    هر Server Function مدیریتی نیز مستقلاً همین بررسی را انجام می‌دهد.
    try {
      await assertAdminAccess();
    } catch (guardError) {
      const message = guardError instanceof Error ? guardError.message : "";
      if (message.includes("Unauthorized")) throw redirect({ to: "/auth" });
      throw redirect({ to: "/dashboard" });
    }

    return { user: data.user };
  },
  component: () => (
    <AdminShell>
      <Outlet />
    </AdminShell>
  ),
});
