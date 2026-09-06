import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/brand-logo";
import { useAuth } from "@/hooks/use-auth";

export function PublicFooter() {
  const { session } = useAuth();
  const year = new Intl.DateTimeFormat("fa-IR", { year: "numeric" }).format(new Date());

  return (
    <footer className="border-t bg-card">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <BrandLogo />
          <p className="mt-4 max-w-sm text-sm leading-7 text-muted-foreground">
            سامانه تخصصی آزمون‌های آنلاین استخدامی؛ تمرین هدفمند، شبیه‌سازی زمان‌دار و تحلیل دقیق
            عملکرد پیش از روز آزمون.
          </p>
        </div>

        <nav aria-label="لینک‌های سریع">
          <h2 className="text-sm font-semibold text-foreground">دسترسی سریع</h2>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li>
              <Link to="/" className="rounded transition-colors hover:text-foreground">
                صفحه اصلی
              </Link>
            </li>
            <li>
              <Link to="/exams" className="rounded transition-colors hover:text-foreground">
                فهرست آزمون‌ها
              </Link>
            </li>
            <li>
              <Link to="/subscription" className="rounded transition-colors hover:text-foreground">
                اشتراک و تعرفه‌ها
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="حساب کاربری">
          <h2 className="text-sm font-semibold text-foreground">حساب کاربری</h2>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            {session ? (
              <>
                <li>
                  <Link to="/dashboard" className="rounded transition-colors hover:text-foreground">
                    داشبورد من
                  </Link>
                </li>
                <li>
                  <Link
                    to="/my-results"
                    className="rounded transition-colors hover:text-foreground"
                  >
                    نتایج من
                  </Link>
                </li>
                <li>
                  <Link to="/profile" className="rounded transition-colors hover:text-foreground">
                    پروفایل
                  </Link>
                </li>
              </>
            ) : (
              <>
                <li>
                  <Link to="/auth" className="rounded transition-colors hover:text-foreground">
                    ورود به حساب
                  </Link>
                </li>
                <li>
                  <Link to="/signup" className="rounded transition-colors hover:text-foreground">
                    ثبت‌نام رایگان
                  </Link>
                </li>
              </>
            )}
          </ul>
        </nav>
      </div>

      <div className="border-t py-6 text-center text-xs text-muted-foreground">
        © {year} همراه استخدام — تمامی حقوق محفوظ است.
      </div>
    </footer>
  );
}
