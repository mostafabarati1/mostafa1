import { Fragment, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut, Menu, ShieldCheck, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_NAV, adminLabelFor } from "@/lib/admin/nav";
import { ThemeToggle } from "@/components/admin/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

type Crumb = { label: string; to?: string | undefined };

function useCrumbs(): Crumb[] {
  const pathname = useRouterState({ select: (s) => decodeURIComponent(s.location.pathname) });
  const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ label: "مدیریت", to: "/admin" }];
  if (segments.length > 1) {
    const sectionPath = `/${segments[0]}/${segments[1]}`;
    crumbs.push({
      label: adminLabelFor(sectionPath) ?? segments[1]!,
      to: segments.length > 2 ? sectionPath : undefined,
    });
    if (segments.length > 2) crumbs.push({ label: "جزئیات" });
  }
  return crumbs;
}

function NavLinks({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const pathname = useRouterState({ select: (s) => decodeURIComponent(s.location.pathname) });

  return (
    <nav className="space-y-6" aria-label="منوی مدیریت">
      {ADMIN_NAV.map((group) => (
        <div key={group.group}>
          <p className="px-3 pb-2 text-[11px] font-semibold tracking-wide text-muted-foreground">
            {group.group}
          </p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const active =
                item.to === "/admin" ? pathname === "/admin" : pathname.startsWith(item.to);
              const base =
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors";
              if (!item.ready) {
                return (
                  <span
                    key={item.to}
                    aria-disabled="true"
                    className={cn(base, "cursor-not-allowed text-muted-foreground/50")}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    <span className="ms-auto text-[10px]">به‌زودی</span>
                  </span>
                );
              }
              return (
                <Link
                  key={item.to}
                  to={item.to as never}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    base,
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <Link to="/admin" onClick={onNavigate} className="flex items-center gap-2 px-2">
        <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
          <ShieldCheck className="size-5" />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-bold text-foreground">همراه استخدام</span>
          <span className="block text-[11px] text-muted-foreground">پنل مدیریت</span>
        </span>
      </Link>
      <NavLinks onNavigate={onNavigate} />
      <div className="mt-auto space-y-1 border-t pt-4">
        <Link
          to="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <ExternalLink className="size-4" />
          بازگشت به سامانه
        </Link>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { displayName, signOut } = useAuth();
  const crumbs = useCrumbs();

  return (
    <div dir="rtl" className="min-h-screen bg-muted/30">
      <aside className="fixed inset-y-0 right-0 hidden w-64 border-l bg-card lg:block">
        <SidebarBody />
      </aside>

      <div className="lg:mr-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-card/80 px-4 py-3 backdrop-blur">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="منو">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0">
              <SheetTitle className="sr-only">منوی مدیریت</SheetTitle>
              <SidebarBody onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>

          <Breadcrumb className="min-w-0 flex-1">
            <BreadcrumbList>
              {crumbs.map((c, i) => (
                <Fragment key={`${c.label}-${i}`}>
                  <BreadcrumbItem>
                    {c.to && i < crumbs.length - 1 ? (
                      <BreadcrumbLink asChild>
                        <Link to={c.to as never}>{c.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage className="truncate">{c.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  {i < crumbs.length - 1 ? <BreadcrumbSeparator className="rotate-180" /> : null}
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>

          <span className="hidden max-w-[14rem] truncate text-xs text-muted-foreground sm:block">
            {displayName}
          </span>
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={() => signOut()} aria-label="خروج">
            <LogOut className="size-4" />
          </Button>
        </header>

        <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
