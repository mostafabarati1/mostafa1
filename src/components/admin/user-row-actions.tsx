import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Ban, CheckCircle2, Eye, MoreHorizontal, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSetUserRole, useSetUserStatus } from "@/lib/admin/user-mutations";

type PendingAction = { kind: "role"; role: "admin" | "candidate" } | { kind: "block" };

export function UserRowActions({
  userId,
  fullName,
  role,
  status,
}: {
  userId: string;
  fullName: string | null;
  role: "admin" | "candidate" | null;
  status: string | null;
}) {
  const [pending, setPending] = useState<PendingAction | null>(null);
  const setStatus = useSetUserStatus();
  const setRole = useSetUserRole();
  const busy = setStatus.isPending || setRole.isPending;
  const isAdmin = role === "admin";
  const isActive = status !== "suspended";
  const name = fullName ?? "این کاربر";

  const confirm = () => {
    if (!pending) return;
    if (pending.kind === "role") setRole.mutate({ id: userId, role: pending.role });
    else setStatus.mutate({ id: userId, status: "suspended" });
    setPending(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={busy} aria-label="عملیات کاربر">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link to="/admin/users/$id" params={{ id: userId }}>
              <Eye className="size-4" />
              مشاهده پرونده
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setPending({ kind: "role", role: isAdmin ? "candidate" : "admin" })}
          >
            {isAdmin ? <ShieldOff className="size-4" /> : <ShieldCheck className="size-4" />}
            {isAdmin ? "سلب دسترسی مدیر" : "ارتقا به مدیر"}
          </DropdownMenuItem>
          {isActive ? (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setPending({ kind: "block" })}
            >
              <Ban className="size-4" />
              مسدودسازی حساب
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setStatus.mutate({ id: userId, status: "active" })}>
              <CheckCircle2 className="size-4" />
              فعال‌سازی حساب
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "block" ? "مسدودسازی حساب کاربر" : "تغییر نقش کاربر"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "block"
                ? `حساب «${name}» مسدود می‌شود و امکان استفاده از سامانه را نخواهد داشت.`
                : pending?.role === "admin"
                  ? `«${name}» به همه بخش‌های مدیریتی دسترسی خواهد داشت.`
                  : `دسترسی مدیریتی «${name}» حذف می‌شود.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>تایید</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
