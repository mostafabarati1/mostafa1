import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  ClipboardList,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Newspaper,
  PencilRuler,
  User,
  Sparkles,
  // SHOP-START
  ShoppingBag,
  ShoppingCart,
  Package,
  // SHOP-END
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "عمومی",
    items: [
      { to: "/dashboard", label: "داشبورد", icon: LayoutDashboard },
      { to: "/exams", label: "آزمون‌ها", icon: GraduationCap },
      { to: "/practice", label: "تمرین", icon: PencilRuler },
      { to: "/my-exams", label: "آزمون‌های من", icon: ClipboardList },
      { to: "/my-results", label: "نتایج من", icon: BarChart3 },
      { to: "/coach", label: "مربی هوشمند", icon: Sparkles },
      { to: "/news", label: "اخبار استخدام", icon: Newspaper },
      // SHOP-START
      { to: "/shop", label: "فروشگاه", icon: ShoppingBag },
      { to: "/cart", label: "سبد خرید", icon: ShoppingCart },
      { to: "/my-orders", label: "سفارش‌های من", icon: Package },
      // SHOP-END
      { to: "/subscription", label: "اشتراک", icon: CreditCard },
      { to: "/profile", label: "پروفایل", icon: User },
    ],
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="space-y-6">
      {NAV.map((group) => {
        const items = group.items;
        if (items.length === 0) return null;
        return (
          <div key={group.group}>
            <p className="mb-2 px-3 text-xs font-medium text-muted-foreground">{group.group}</p>
            <ul className="space-y-1">
              {items.map((item) => {
                const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { displayName, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="منو">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 overflow-y-auto bg-sidebar p-4">
              <SheetTitle className="mb-4 text-base">همراه استخدام</SheetTitle>
              <NavLinks onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>

          <Link to="/dashboard" className="flex items-center gap-2 font-bold">
            <BrandLogo variant="icon" size={28} decorative />
            همراه استخدام
          </Link>

          <div className="ms-auto flex items-center gap-2">
            <ThemeToggle />
            {isAdmin && (
              <span className="hidden rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary sm:inline">
                مدیر سامانه
              </span>
            )}
            <span className="hidden max-w-40 truncate text-sm text-muted-foreground sm:inline">
              {displayName}
            </span>
            <Button variant="ghost" size="icon" aria-label="خروج" onClick={() => void signOut()}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto border-s bg-sidebar p-4 lg:block">
          <NavLinks />
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
