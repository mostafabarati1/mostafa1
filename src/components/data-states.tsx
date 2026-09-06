import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw, UserPlus, WifiOff } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { humanizeError, isOfflineError } from "@/lib/format";

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function CardsLoading({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-44 w-full rounded-2xl" />
      ))}
    </div>
  );
}

/** تشخیص خطاهای مربوط به نداشتن دسترسی/ورود نکردن */
function isAccessError(error: unknown): boolean {
  const raw = humanizeError(error).toLowerCase();
  return (
    raw.includes("دسترسی لازم") ||
    raw.includes("permission denied") ||
    raw.includes("row-level security") ||
    raw.includes("jwt") ||
    raw.includes("unauthorized") ||
    raw.includes("not authenticated")
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (isOfflineError(error)) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 text-center"
      >
        <WifiOff className="size-8 text-amber-500" />
        <p className="font-medium text-foreground">شما آفلاین هستید</p>
        <p className="text-sm text-muted-foreground">
          ارتباط با سرور برقرار نشد. اتصال اینترنت خود را بررسی کنید و دوباره تلاش کنید.
        </p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="size-4" />
            تلاش دوباره
          </Button>
        )}
      </div>
    );
  }

  if (isAccessError(error)) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center"
      >
        <UserPlus className="size-8 text-primary" />
        <p className="font-medium text-foreground">برای مشاهده، ثبت‌نام کنید</p>
        <p className="text-sm text-muted-foreground">
          برای دیدن این بخش باید حساب کاربری داشته باشید. ثبت‌نام رایگان است.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild size="sm">
            <Link to="/signup">ثبت‌نام رایگان</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/auth">ورود به حساب</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center"
    >
      <AlertTriangle className="size-8 text-destructive" />
      <p className="font-medium text-foreground">خطا در دریافت اطلاعات</p>
      <p className="text-sm text-muted-foreground">{humanizeError(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-4" />
          تلاش دوباره
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title = "موردی یافت نشد",
  description,
  action,
  icon,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-muted/30 p-10 text-center">
      {icon ?? <Inbox className="size-8 text-muted-foreground" />}
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
