import { Ban, CalendarPlus, CheckCircle2, ShieldCheck, ShieldOff, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/admin/user-detail/confirm-action-dialog";
import {
  useCancelSubscription,
  useExtendSubscription,
  useSetUserRole,
  useSetUserStatus,
} from "@/lib/admin/user-mutations";

/** عملیات نقش و وضعیت حساب (تب پروفایل و هدر). */
export function UserAccountActions({
  userId,
  role,
  status,
  isSelf,
}: {
  userId: string;
  role: "admin" | "candidate" | null;
  status: string | null;
  isSelf: boolean;
}) {
  const setRole = useSetUserRole();
  const setStatus = useSetUserStatus();
  const isAdmin = role === "admin";
  const isSuspended = status !== "active";

  return (
    <>
      <ConfirmActionDialog
        trigger={
          <Button variant="outline" size="sm" disabled={setRole.isPending || (isSelf && isAdmin)}>
            {isAdmin ? <ShieldOff className="size-4" /> : <ShieldCheck className="size-4" />}
            {isAdmin ? "سلب دسترسی مدیر" : "ارتقا به مدیر"}
          </Button>
        }
        title="تغییر نقش کاربر"
        description={
          isAdmin
            ? "با تأیید، دسترسی مدیریتی این کاربر حذف می‌شود."
            : "با تأیید، این کاربر به تمام بخش‌های مدیریتی دسترسی خواهد داشت."
        }
        confirmLabel="اعمال تغییر نقش"
        destructive={isAdmin}
        pending={setRole.isPending}
        reasonLabel="دلیل تغییر نقش"
        onConfirm={({ reason }) =>
          setRole.mutateAsync({
            id: userId,
            role: isAdmin ? "candidate" : "admin",
            reason,
          })
        }
      />

      <ConfirmActionDialog
        trigger={
          <Button
            variant="outline"
            size="sm"
            disabled={setStatus.isPending || (isSelf && !isSuspended)}
          >
            {isSuspended ? <CheckCircle2 className="size-4" /> : <Ban className="size-4" />}
            {isSuspended ? "رفع مسدودی حساب" : "مسدودسازی حساب"}
          </Button>
        }
        title={isSuspended ? "فعال‌سازی حساب کاربر" : "مسدودسازی حساب کاربر"}
        description={
          isSuspended
            ? "کاربر دوباره می‌تواند وارد حساب خود شود و از سرویس استفاده کند."
            : "کاربر تا زمان رفع مسدودی امکان استفاده از سرویس را نخواهد داشت."
        }
        confirmLabel={isSuspended ? "فعال‌سازی" : "مسدودسازی"}
        destructive={!isSuspended}
        pending={setStatus.isPending}
        requireReason={!isSuspended}
        reasonLabel="دلیل تغییر وضعیت"
        onConfirm={({ reason }) =>
          setStatus.mutateAsync({
            id: userId,
            status: isSuspended ? "active" : "suspended",
            reason,
          })
        }
      />
    </>
  );
}

/** عملیات تمدید و لغو اشتراک (تب اشتراک‌ها). */
export function UserSubscriptionActions({ userId }: { userId: string }) {
  const extend = useExtendSubscription();
  const cancel = useCancelSubscription();

  return (
    <>
      <ConfirmActionDialog
        trigger={
          <Button size="sm" disabled={extend.isPending}>
            <CalendarPlus className="size-4" />
            تمدید اشتراک
          </Button>
        }
        title="تمدید اشتراک کاربر"
        description="تعداد روز موردنظر به اعتبار فعلی کاربر افزوده می‌شود."
        confirmLabel="تمدید"
        pending={extend.isPending}
        withDays
        reasonLabel="دلیل تمدید"
        onConfirm={({ days, reason }) => extend.mutateAsync({ id: userId, days, reason })}
      />

      <ConfirmActionDialog
        trigger={
          <Button variant="outline" size="sm" disabled={cancel.isPending}>
            <XCircle className="size-4" />
            لغو اشتراک
          </Button>
        }
        title="لغو اشتراک کاربر"
        description="تمام اشتراک‌های فعال این کاربر لغو می‌شوند. این عملیات در تاریخچه ثبت می‌شود."
        confirmLabel="لغو اشتراک"
        destructive
        pending={cancel.isPending}
        requireReason
        reasonLabel="دلیل لغو"
        onConfirm={({ reason }) => cancel.mutateAsync({ id: userId, reason })}
      />
    </>
  );
}
