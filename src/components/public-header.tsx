import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { ThemeToggle } from "@/components/theme-toggle";

const SECTIONS = [
  { href: "#exams", label: "آزمون‌ها" },
  { href: "#organizations", label: "سازمان‌ها" },
  { href: "#categories", label: "دسته‌بندی‌ها" },
  { href: "#pricing", label: "اشتراک" },
  { href: "#faq", label: "سوالات متداول" },
];

export function PublicHeader() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link to="/" className="rounded-lg" aria-label="همراه استخدام — صفحه اصلی">
          <BrandLogo />
        </Link>

        <nav aria-label="ناوبری اصلی" className="ms-6 hidden items-center gap-1 lg:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.href}
              href={s.href}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <ThemeToggle className="min-h-11 min-w-11" />
          {session ? (
            <>
              <Button asChild variant="ghost" className="hidden min-h-11 sm:inline-flex">
                <Link to="/exams">مشاهده آزمون‌ها</Link>
              </Button>
              <Button asChild className="min-h-11">
                <Link to="/dashboard">داشبورد من</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" className="min-h-11">
                <Link to="/auth">ورود</Link>
              </Button>
              <Button asChild className="min-h-11">
                <Link to="/signup">ثبت‌نام رایگان</Link>
              </Button>
            </>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11 lg:hidden"
                aria-label="منوی سایت"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-5">
              <SheetTitle className="mb-6">
                <BrandLogo />
              </SheetTitle>
              <nav aria-label="ناوبری موبایل" className="space-y-1">
                {SECTIONS.map((s) => (
                  <a
                    key={s.href}
                    href={s.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-3 text-sm text-foreground transition-colors hover:bg-accent"
                  >
                    {s.label}
                  </a>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
