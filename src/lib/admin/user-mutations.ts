import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { rpc } from "@/lib/supabase-rpc";
import { humanizeError } from "@/lib/format";

export type UserStatus = "active" | "suspended";

export const USER_STATUS_LABEL: Record<string, string> = {
  active: "فعال",
  suspended: "مسدود",
};

/**
 * همه عملیات حساس کاربر از طریق RPCهای امن (SECURITY DEFINER + بررسی نقش مدیر
 * + ثبت audit log در سمت سرور) انجام می‌شود؛ هیچ write مستقیمی از مرورگر روی
 * جدول‌های حساس انجام نمی‌شود.
 */
function useAdminUserMutation<TVars>(
  run: (vars: TVars) => Promise<unknown>,
  successMessage: (vars: TVars) => string,
  userIdOf: (vars: TVars) => string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: TVars) => {
      await run(vars);
      return vars;
    },
    onSuccess: (vars) => {
      toast.success(successMessage(vars));
      const id = userIdOf(vars);
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
    },
    onError: (e) => toast.error(humanizeError(e)),
  });
}

/** فعال‌سازی یا مسدودسازی حساب کاربر. */
export function useSetUserStatus() {
  return useAdminUserMutation<{ id: string; status: UserStatus; reason?: string }>(
    ({ id, status, reason }) =>
      rpc("admin_set_user_status", {
        p_user_id: id,
        p_status: status,
        p_reason: reason?.trim() || null,
      }),
    ({ status }) => (status === "active" ? "حساب کاربر فعال شد." : "حساب کاربر مسدود شد."),
    ({ id }) => id,
  );
}

/** تغییر نقش کاربر بین مدیر و کاربر عادی. */
export function useSetUserRole() {
  return useAdminUserMutation<{ id: string; role: "admin" | "candidate"; reason?: string }>(
    ({ id, role, reason }) =>
      rpc("admin_set_user_role", {
        p_user_id: id,
        p_role: role,
        p_reason: reason?.trim() || null,
      }),
    ({ role }) => (role === "admin" ? "کاربر به مدیر ارتقا یافت." : "دسترسی مدیریتی حذف شد."),
    ({ id }) => id,
  );
}

/** تمدید یا اعطای اشتراک برای کاربر. */
export function useExtendSubscription() {
  return useAdminUserMutation<{ id: string; days: number; reason?: string }>(
    ({ id, days, reason }) =>
      rpc("admin_grant_subscription", {
        p_user_id: id,
        p_days: days,
        p_reason: reason?.trim() || null,
      }),
    ({ days }) => `اشتراک کاربر ${days} روز تمدید شد.`,
    ({ id }) => id,
  );
}

/** لغو اشتراک کاربر؛ ثبت دلیل الزامی است. */
export function useCancelSubscription() {
  return useAdminUserMutation<{ id: string; reason: string }>(
    ({ id, reason }) => rpc("admin_cancel_subscription", { p_user_id: id, p_reason: reason }),
    () => "اشتراک کاربر لغو شد.",
    ({ id }) => id,
  );
}
