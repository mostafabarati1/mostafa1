import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  BarChart3,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleCheckBig,
  Facebook,
  FolderTree,
  Gauge,
  Gift,
  Instagram,
  Layers3,
  Linkedin,
  ListChecks,
  Menu,
  MessageCircle,
  Moon,
  NotebookPen,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Timer,
  TimerReset,
  TrendingUp,
  Twitter,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CardsLoading, ErrorState } from "@/components/data-states";
import { ExamCard } from "@/components/exam-card";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { formatNumber, formatPrice } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import type { CatalogTree, Plan, PublicExam } from "@/lib/types";
import brandMark from "@/assets/brand-mark.png";

const LOGO = brandMark;

const PAGE_TITLE = "همراه استخدام — سطح آمادگی‌ات را برای آزمون استخدامی بسنج";
const PAGE_DESCRIPTION =
  "با آزمون شبیه‌سازی‌شده، تحلیل درس‌به‌درس و دفتر اشتباهات بفهم دقیقاً کجا ضعف داری. ۷ روز رایگان، بدون پرداخت اولیه.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const CTA_LABEL = "شروع رایگان ۷ روزه";
const MICROCOPY = "۷ روز رایگان • بدون پرداخت اولیه • شروع فوری";

const features: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Timer,
    title: "آزمون شبیه روز واقعی",
    body: "با شرایطی نزدیک به آزمون واقعی تمرین کن و قبل از روز اصلی، آمادگی‌ات را بسنج.",
  },
  {
    icon: Bot,
    title: "توضیح هوش مصنوعی",
    body: "برای سؤال‌های دشوار، توضیح فارسی و قابل فهم دریافت کن.",
  },
  {
    icon: BarChart3,
    title: "تحلیل عملکرد",
    body: "دقیقاً بفهم در کدام درس‌ها و مباحث نیاز به تمرین بیشتری داری.",
  },
  {
    icon: NotebookPen,
    title: "دفتر اشتباهات",
    body: "سؤال‌هایی را که اشتباه زده‌ای دوباره مرور کن تا اشتباهاتت تکرار نشوند.",
  },
  {
    icon: Target,
    title: "شبیه‌سازی واقعی آزمون",
    body: "چیدمان، فشار زمانی و تجربه‌ای نزدیک به روز آزمون؛ پیش از آن‌که نتیجه واقعی در میان باشد.",
  },
  {
    icon: Layers3,
    title: "بانک سؤال هدفمند",
    body: "سؤال‌های استاندارد و دسته‌بندی‌شده برای تمرین متناسب با هدف و سطح شما.",
  },
  {
    icon: Gauge,
    title: "تجربه مشابه جلسه واقعی",
    body: "با شرایط آزمون خو بگیرید تا روز اصلی، محیط و ریتم جلسه برایتان آشنا باشد.",
  },
  {
    icon: ShieldCheck,
    title: "آمادگی ذهنی و عملکردی",
    body: "فقط بیشتر نخوانید؛ تمرکز، آرامش و اجرای دانسته‌ها زیر فشار را هم تمرین کنید.",
  },
];

const problemCards = [
  ["ذهن پر از سؤال", "از کدام مبحث شروع کنم؟ چه چیزی مهم‌تر است؟"],
  ["مطالعه بی‌ساختار", "ساعت‌ها مطالعه، بدون یک مسیر روشن برای مرور و تمرین."],
  ["رقابت با زمان", "دانستن پاسخ کافی نیست؛ باید بتوانی در زمان محدود انتخاب کنی."],
  ["نقطه‌ضعف‌های پنهان", "تا آزمون ندهی، نمی‌فهمی دانسته‌هایت کجا به عملکرد تبدیل نمی‌شوند."],
] as const;

const journey = [
  ["۰۱", "ابهام و اضطراب", "مطالب زیادند، زمان کم است و هنوز نمی‌دانید واقعاً چقدر آماده‌اید."],
  ["۰۲", "اولین شبیه‌سازی", "در یک محیط کنترل‌شده، خودتان را درست مثل جلسه واقعی محک می‌زنید."],
  [
    "۰۳",
    "دیدن نقاط پنهان",
    "گزارش هوشمند نشان می‌دهد کجا زمان از دست می‌رود و کدام مبحث نیاز به توجه دارد.",
  ],
  [
    "۰۴",
    "تمرین هدفمند",
    "به‌جای دوباره‌خوانی همه‌چیز، دقیقاً روی فاصله میان وضعیت امروز و هدف تمرکز می‌کنید.",
  ],
  [
    "۰۵",
    "اعتماد به پیشرفت",
    "نمودارها بالا می‌روند، زمان بهتر مدیریت می‌شود و تردید جای خود را به اطمینان می‌دهد.",
  ],
  ["۰۶", "آمادگی روز آزمون", "فضا آشناست، ذهن آرام است و برای هر دقیقه برنامه دارید."],
  ["۰۷", "آغاز مسیر شغلی", "قبولی دیگر یک آرزوی مبهم نیست؛ نتیجه آمادگی سنجیده و واقعی شماست."],
] as const;

const BEFORE = [
  "تست‌های پراکنده",
  "مشخص نبودن نقاط ضعف",
  "فراموش شدن اشتباهات",
  "نداشتن تصویر واقعی از میزان آمادگی",
];
const AFTER = ["آزمون شبیه‌سازی‌شده", "تحلیل درس‌به‌درس", "دفتر اشتباهات", "مسیر تمرین مشخص"];

const FAQ = [
  ["آیا واقعاً ۷ روز رایگان است؟", "بله. فقط با ثبت‌نام فعال می‌شود و پرداخت اولیه‌ای لازم نیست."],
  [
    "بعد از ۷ روز چه اتفاقی می‌افتد؟",
    "اگر ادامه ندهی، هیچ هزینه‌ای کسر نمی‌شود. برای ادامه، یکی از پلن‌ها را انتخاب می‌کنی.",
  ],
  [
    "آیا همه آزمون‌های استخدامی را پوشش می‌دهید؟",
    "آزمون‌ها و سازمان‌های موجود مرتب به‌روز می‌شوند. اگر آزمون هدفت هنوز اضافه نشده، به ما اطلاع بده.",
  ],
  [
    "آیا توضیح AI برای سؤال‌ها وجود دارد؟",
    "بله. برای سؤال‌های دشوار، توضیح فارسی و کوتاه دریافت می‌کنی.",
  ],
  ["آیا روی موبایل هم قابل استفاده است؟", "بله. تمام بخش‌ها روی موبایل و تبلت کامل کار می‌کنند."],
  [
    "می‌توانم فقط آزمون یک سازمان خاص را تمرین کنم؟",
    "بله. می‌توانی بر اساس سازمان، دسته و درس فیلتر کنی و فقط همان‌ها را تمرین کنی.",
  ],
  [
    "قیمت اشتراک چقدر است؟",
    "قیمت پلن‌های ماهانه، سه‌ماهه و سالانه در بخش تعرفه‌ها همین صفحه نمایش داده می‌شود.",
  ],
] as const;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

function LandingPage() {
  const { session } = useAuth();
  const { theme, ready, toggle } = useTheme();
  const reducedMotion = usePrefersReducedMotion();
  const isAuthed = Boolean(session);
  const ctaTo = isAuthed ? "/exams" : "/signup";
  const ctaText = isAuthed ? "شروع آزمون آزمایشی" : CTA_LABEL;

  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const [journeyProgress, setJourneyProgress] = useState(0);
  const [activeJourney, setActiveJourney] = useState(0);
  const journeyRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
    );

    const observeAll = () => {
      document
        .querySelectorAll<HTMLElement>(".reveal:not(.is-visible)")
        .forEach((el) => observer.observe(el));
    };

    observeAll();

    // عناصری که پس از بارگذاری داده‌ها رندر می‌شوند (آزمون‌ها، پلن‌ها، سازمان‌ها و …)
    // هم باید زیر نظر observer قرار بگیرند، وگرنه نامرئی می‌مانند.
    const mutationObserver = new MutationObserver(observeAll);
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    let ticking = false;
    const measure = () => {
      const scrollY = window.scrollY;
      setScrolled(scrollY > 24);

      const section = journeyRef.current;
      if (section) {
        const rect = section.getBoundingClientRect();
        const vh = window.innerHeight;
        const total = rect.height + vh * 0.15;
        const progressed = Math.min(Math.max((vh * 0.72 - rect.top) / total, 0), 1);
        const percent = Math.round(progressed * 100);
        setJourneyProgress(percent);
        setActiveJourney(Math.min(journey.length - 1, Math.floor(progressed * journey.length)));
      }

      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const examsQuery = useQuery({
    queryKey: ["landing-exams"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_exams_public", {
        p_page: 1,
        p_page_size: 6,
      });
      if (error) throw error;
      return data as unknown as { items: PublicExam[]; total: number };
    },
  });

  const catalogQuery = useQuery({
    queryKey: ["landing-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("exam_catalog_tree");
      if (error) throw error;
      return data as unknown as CatalogTree;
    },
  });

  const contactQuery = useQuery({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_settings" as never);
      if (error) throw error;
      return (data ?? {}) as Record<string, string | number | null>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const contact = contactQuery.data ?? {};
  const supportEmail = typeof contact["support_email"] === "string" ? contact["support_email"] : "";
  const supportPhone = typeof contact["support_phone"] === "string" ? contact["support_phone"] : "";
  const socialLinks = (
    [
      ["social_instagram", "اینستاگرام", Instagram],
      ["social_telegram", "تلگرام", Send],
      ["social_whatsapp", "واتس‌اپ", MessageCircle],
      ["social_linkedin", "لینکدین", Linkedin],
      ["social_facebook", "فیسبوک", Facebook],
      ["social_x", "ایکس", Twitter],
    ] as const
  ).flatMap(([key, label, icon]) => {
    const url = contact[key];
    return typeof url === "string" && url.trim() ? [{ label, icon, url: url.trim() }] : [];
  });

  const plansQuery = useQuery({
    queryKey: ["landing-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, title, price, duration_months, is_active, display_order")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  const exams = examsQuery.data?.items ?? [];
  const catalog = catalogQuery.data;
  const plans = plansQuery.data ?? [];
  const rootCategories = (catalog?.categories ?? []).filter((c) => !c.parent_id);
  const categories = rootCategories.length > 0 ? rootCategories : (catalog?.categories ?? []);

  const heroStats = useMemo(
    () =>
      [
        { label: "آزمون منتشرشده", value: examsQuery.data?.total ?? 0, suffix: "+" },
        { label: "سازمان برگزارکننده", value: catalog?.organizations.length ?? 0, suffix: "+" },
        { label: "درس تخصصی", value: catalog?.subjects.length ?? 0, suffix: "+" },
        { label: "میانگین رشد عملکرد", value: 37, suffix: "%" },
      ].filter((item) => item.value > 0),
    [catalog?.organizations.length, catalog?.subjects.length, examsQuery.data?.total],
  );

  return (
    <main className="bg-background text-foreground" dir="rtl">
      <style>{`
        html { scroll-behavior: smooth; }
        .glass-nav { background: color-mix(in oklab, var(--background) 78%, transparent); backdrop-filter: blur(14px); }
        .reveal { opacity: 0; transform: translateY(24px) scale(.985); transition: opacity .7s ease, transform .7s cubic-bezier(.22,1,.36,1), border-color .3s ease, background-color .3s ease; }
        .reveal.is-visible { opacity: 1; transform: translateY(0) scale(1); }
        .hero-stage { opacity: 0; transform: translateY(24px); animation: heroEnter .82s cubic-bezier(.22,1,.36,1) forwards; }
        .float-soft { animation: floatSoft 8s ease-in-out infinite; }
        .pulse-glow { animation: pulseGlow 3.6s ease-in-out infinite; }
        .dash-grid { background-image: linear-gradient(to right, color-mix(in oklab, var(--border) 60%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--border) 60%, transparent) 1px, transparent 1px); background-size: 26px 26px; }
        .timeline-glow { box-shadow: 0 0 0 6px color-mix(in oklab, var(--primary) 10%, transparent); }
        .progress-beam { transition: height .25s ease-out; }
        .parallax-card { will-change: transform; }
        .cta-sheen::after { content: ""; position: absolute; inset: 0; background: linear-gradient(105deg, transparent 25%, rgba(255,255,255,.12) 50%, transparent 75%); transform: translateX(120%); animation: sheen 6s ease-in-out infinite; }
        @keyframes heroEnter { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes floatSoft { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
        @keyframes pulseGlow { 0%,100% { box-shadow: 0 0 0 0 rgba(59,130,246,.12); } 50% { box-shadow: 0 0 0 12px rgba(59,130,246,0); } }
        @keyframes sheen { 0%, 75%, 100% { transform: translateX(120%); } 18%, 28% { transform: translateX(-120%); } }
        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          .reveal, .hero-stage, .float-soft, .pulse-glow, .cta-sheen::after { animation: none !important; transition: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      <header
        className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-300 ${scrolled ? "glass-nav border-border/70 py-2" : "border-transparent bg-transparent py-4"}`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link to="/" aria-label="همراه استخدام">
            <BrandLogo />
          </Link>
          <nav
            className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex"
            aria-label="ناوبری اصلی"
          >
            <a className="transition-colors hover:text-primary" href="#features">
              امکانات
            </a>
            <a className="transition-colors hover:text-primary" href="#journey">
              مسیر موفقیت
            </a>
            <a className="transition-colors hover:text-primary" href="#experience">
              محیط آزمون
            </a>
            <a className="transition-colors hover:text-primary" href="#exams">
              آزمون‌ها
            </a>
            <a className="transition-colors hover:text-primary" href="#pricing">
              تعرفه‌ها
            </a>
            <a className="transition-colors hover:text-primary" href="#faq">
              پرسش‌های متداول
            </a>
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggle}
              disabled={!ready}
              aria-label={theme === "dark" ? "فعال کردن حالت روشن" : "فعال کردن حالت تاریک"}
              title={theme === "dark" ? "حالت روشن" : "حالت تاریک"}
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
            <Button variant="premium" asChild>
              <Link to={ctaTo}>
                {ctaText} <ArrowLeft />
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-1 md:hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggle}
              disabled={!ready}
              aria-label={theme === "dark" ? "فعال کردن حالت روشن" : "فعال کردن حالت تاریک"}
              title={theme === "dark" ? "حالت روشن" : "حالت تاریک"}
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMenu((prev) => !prev)}
              aria-label="نمایش منو"
            >
              {menu ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        {menu && (
          <nav className="glass-nav mx-4 mt-2 grid gap-4 rounded-lg border border-border p-5 text-sm md:hidden">
            <a href="#features" onClick={() => setMenu(false)}>
              امکانات
            </a>
            <a href="#journey" onClick={() => setMenu(false)}>
              مسیر موفقیت
            </a>
            <a href="#experience" onClick={() => setMenu(false)}>
              محیط آزمون
            </a>
            <a href="#exams" onClick={() => setMenu(false)}>
              آزمون‌ها
            </a>
            <a href="#pricing" onClick={() => setMenu(false)}>
              تعرفه‌ها
            </a>
            <Button
              type="button"
              variant="soft"
              className="w-full justify-center"
              onClick={toggle}
              disabled={!ready}
            >
              {theme === "dark" ? <Sun /> : <Moon />}
              {theme === "dark" ? "حالت روشن" : "حالت تاریک"}
            </Button>
            <Button variant="premium" asChild>
              <Link to={ctaTo} onClick={() => setMenu(false)}>
                {ctaText}
              </Link>
            </Button>
          </nav>
        )}
      </header>

      <section id="top" className="relative overflow-hidden pt-32 lg:pt-40">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[36rem] bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,.18),transparent_32%),radial-gradient(circle_at_10%_30%,rgba(34,197,94,.12),transparent_26%)]" />
        <div className="pointer-events-none absolute -left-28 top-36 h-80 w-80 rounded-full border-[54px] border-primary/8" />
        <div className="pointer-events-none absolute right-[8%] top-32 h-24 w-40 rotate-12 rounded-[100%_0_100%_0] border-2 border-success/20 float-soft" />
        <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 pb-20 lg:grid-cols-[.92fr_1.08fr] lg:px-8 lg:pb-28">
          <div className="relative z-10">
            <div
              className="hero-stage mb-7 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-4 py-2 text-xs font-semibold text-primary"
              style={{ animationDelay: "80ms" }}
            >
              <Gift className="size-4" /> ۷ روز رایگان — بدون پرداخت اولیه
            </div>
            <h1
              className="hero-stage max-w-2xl text-4xl font-black leading-[1.45] md:text-6xl lg:text-7xl"
              style={{ animationDelay: "180ms" }}
            >
              با تمرینِ شبیه واقعیت،{" "}
              <span className="relative text-primary">
                یک قدم جلوتر
                <span className="absolute -bottom-2 right-0 h-1 w-full rounded-full bg-success/50" />
              </span>{" "}
              از رقبا باش
            </h1>
            <p
              className="hero-stage mt-7 max-w-xl text-base leading-8 text-muted-foreground md:text-lg"
              style={{ animationDelay: "280ms" }}
            >
              همراه استخدام، شبیه‌ساز هوشمند آزمون‌های استخدامی برای مدیریت زمان، تحلیل عملکرد، دفتر
              اشتباهات و ساختن یک مسیر دقیق تا قبولی است.
            </p>
            <div
              className="hero-stage mt-9 flex flex-col gap-3 sm:flex-row"
              style={{ animationDelay: "380ms" }}
            >
              <Button size="lg" variant="premium" className="pulse-glow" asChild>
                <Link to={ctaTo}>
                  {ctaText} <ArrowLeft />
                </Link>
              </Button>
              <Button size="lg" variant="soft" asChild>
                <a href="#experience">
                  <Play /> دیدن محیط شبیه‌ساز
                </a>
              </Button>
            </div>
            <div
              className="hero-stage mt-8 flex flex-wrap gap-5 text-xs text-muted-foreground"
              style={{ animationDelay: "480ms" }}
            >
              <span className="flex items-center gap-2">
                <CircleCheckBig className="size-4 text-success" /> تحلیل بلافاصله پس از آزمون
              </span>
              <span className="flex items-center gap-2">
                <CircleCheckBig className="size-4 text-success" /> دفتر اشتباهات و مسیر تمرین
              </span>
              <span className="flex items-center gap-2">
                <CircleCheckBig className="size-4 text-success" /> شروع سریع و ساده
              </span>
            </div>
          </div>
          <DashboardMockup hero reducedMotion={reducedMotion} />
        </div>
      </section>

      <section className="border-t border-border bg-surface-strong py-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          {heroStats.length > 0 ? (
            <div className="grid gap-px overflow-hidden rounded-[1.5rem] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {heroStats.map((s, idx) => (
                <Stat
                  key={s.label}
                  value={s.value}
                  suffix={s.suffix}
                  label={s.label}
                  delay={idx * 90}
                />
              ))}
            </div>
          ) : (
            <p className="text-center text-sm font-semibold text-muted-foreground">
              همه ابزارهای لازم برای آمادگی آزمون استخدامی، در یکجا
            </p>
          )}
        </div>
      </section>

      <section className="bg-surface-strong py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <SectionTitle
            eyebrow="مسئله‌ای که خوب می‌شناسیم"
            title="زیاد می‌خوانی، اما هنوز مطمئن نیستی آماده‌ای"
            body="فشار آزمون از جایی شروع می‌شود که تلاش می‌کنی، اما معیاری برای سنجیدن آمادگی‌ات نداری. کتاب‌ها جلو می‌روند و سؤال اصلی بی‌جواب می‌ماند: اگر امروز آزمون بود، چه می‌شد؟"
          />
          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {problemCards.map((p, i) => (
              <article
                key={p[0]}
                className="reveal group border-t-2 border-border bg-background p-6 shadow-[var(--shadow-soft)] transition-all hover:-translate-y-1 hover:border-primary"
                style={{ transitionDelay: `${i * 90}ms` }}
              >
                <span className="mb-8 block text-3xl font-light text-primary/40">۰{i + 1}</span>
                <h3 className="text-lg font-bold">{p[0]}</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{p[1]}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="demo" className="border-y border-border bg-surface-strong py-20">
        <div className="mx-auto max-w-3xl px-5 text-center lg:px-8">
          <SectionTitle
            eyebrow="بسنج و مطمئن شو"
            title="چقدر برای آزمون استخدامی آماده‌ای؟"
            body="حدس نزن؛ همین حالا سطح آمادگی‌ات را با یک تجربه کوتاه و شبیه‌سازی‌شده محک بزن."
          />
          <div className="reveal mt-8 border border-border bg-background p-6 text-right shadow-[var(--shadow-soft)] sm:p-8">
            <span className="mb-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              آزمون کوتاه آمادگی
            </span>
            <p className="text-sm text-muted-foreground">
              ۱۰ سؤال • تحلیل فوری • نتیجه در چند دقیقه
            </p>
            <Button size="lg" variant="premium" className="mt-6 w-full sm:w-auto" asChild>
              <Link to={ctaTo}>
                همین حالا خودم را محک می‌زنم <ArrowLeft />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section id="features" className="bg-foreground py-24 text-background lg:py-32">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <SectionTitle
            dark
            eyebrow="ابزارهای آمادگی"
            title="هر چیزی که برای تبدیل تلاش به نتیجه نیاز داری"
            body="یک تجربه یکپارچه برای تمرین، سنجش و پیشرفت؛ بدون پیچیدگی و بدون سردرگمی."
          />
          <div className="mt-14 grid gap-px overflow-hidden rounded-[1.5rem] bg-background/10 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, body }, i) => (
              <article
                key={title}
                className="reveal group min-h-64 bg-foreground p-7 transition-colors hover:bg-navy-soft"
                style={{ transitionDelay: `${(i % 4) * 75}ms` }}
              >
                <Icon className="size-8 text-primary" strokeWidth={1.6} />
                <h3 className="mt-8 font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-background/60">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="journey" ref={journeyRef} className="relative py-24 lg:min-h-[150vh] lg:py-36">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <SectionTitle
            eyebrow="روایت موفقیت تو"
            title="از «نمی‌دانم آماده‌ام یا نه» تا «من آماده‌ام»"
            body="موفقیت یک پرش ناگهانی نیست؛ مجموعه‌ای از قدم‌های کوچک، قابل‌اندازه‌گیری و درست است."
          />
          <div className="relative mt-16 grid gap-10 lg:grid-cols-[.78fr_1.22fr]">
            <aside className="lg:sticky lg:top-28 lg:h-[72vh]">
              <div className="relative flex h-full min-h-[28rem] flex-col justify-between overflow-hidden rounded-[1.75rem] bg-foreground p-8 text-background shadow-[var(--shadow-soft)] md:p-12">
                <div className="absolute -left-20 -top-20 size-72 rounded-full border-[48px] border-primary/15" />
                <div className="absolute right-10 top-16 size-24 rotate-12 rounded-[100%_0_100%_0] border-2 border-success/30 float-soft" />
                <div className="relative flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-background/15 bg-background/5 px-3 py-1 text-xs font-semibold text-background/80">
                    <Sparkles className="size-4 text-primary" /> داستان موفقیت
                  </span>
                  <span className="rounded-full bg-background/10 px-3 py-1 text-xs font-bold text-primary">
                    {journeyProgress}%
                  </span>
                </div>
                <div className="relative mt-auto">
                  <blockquote className="text-2xl font-bold leading-[1.8] md:text-3xl">
                    «اعتمادبه‌نفس، وقتی ساخته می‌شود که پیشرفتت را با چشم خودت ببینی.»
                  </blockquote>
                  <p className="mt-5 max-w-md text-sm leading-7 text-background/65">
                    هر اسکرول در این بخش، یک قدم از ابهام به آمادگی است. کاربر فقط صفحه را نمی‌بیند؛
                    مسیر رشد خودش را حس می‌کند.
                  </p>
                  <div className="mt-8 grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-2xl border border-background/10 bg-background/5 px-3 py-4">
                      <strong className="block text-lg text-primary">زمان</strong>
                      <span className="mt-1 block text-[11px] text-background/60">قابل کنترل</span>
                    </div>
                    <div className="rounded-2xl border border-background/10 bg-background/5 px-3 py-4">
                      <strong className="block text-lg text-primary">دقت</strong>
                      <span className="mt-1 block text-[11px] text-background/60">قابل سنجش</span>
                    </div>
                    <div className="rounded-2xl border border-background/10 bg-background/5 px-3 py-4">
                      <strong className="block text-lg text-primary">مسیر</strong>
                      <span className="mt-1 block text-[11px] text-background/60">
                        شفاف و هدفمند
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
            <div className="relative pr-10 md:pr-16">
              <div className="absolute bottom-0 right-3 top-0 w-px bg-border md:right-6">
                <div
                  className="progress-beam sticky top-28 w-px bg-primary"
                  style={{ height: `${Math.max(journeyProgress, 12)}%` }}
                />
              </div>
              {journey.map((j, i) => {
                const active = i <= activeJourney;
                return (
                  <article
                    key={j[0]}
                    className={`reveal relative mb-10 min-h-44 rounded-[1.25rem] border pb-10 pl-6 pr-6 pt-6 transition-all duration-500 md:pr-8 ${active ? "border-primary/40 bg-primary/5 shadow-[var(--shadow-soft)]" : "border-border bg-background"}`}
                  >
                    <span
                      className={`absolute -right-[2.72rem] top-6 flex size-8 items-center justify-center rounded-full border-4 border-background text-[10px] font-bold md:-right-[4.08rem] ${active ? "timeline-glow bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                    >
                      {i + 1}
                    </span>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs font-bold text-primary">مرحله {j[0]}</span>
                      {active && (
                        <span className="rounded-full bg-success-soft px-2.5 py-1 text-[10px] font-bold text-success">
                          در حال تثبیت
                        </span>
                      )}
                    </div>
                    <h3 className="mt-3 text-2xl font-black">{j[1]}</h3>
                    <p className="mt-4 max-w-xl leading-8 text-muted-foreground">{j[2]}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="experience" className="overflow-hidden bg-surface-strong py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid items-end gap-8 lg:grid-cols-2">
            <SectionTitle
              eyebrow="تجربه محصول"
              title="در هر آزمون، فقط نمره نمی‌گیری؛ خودت را بهتر می‌شناسی"
              body="محیطی آرام و متمرکز برای آزمون، و گزارشی شفاف برای تصمیم بعدی. انیمیشن‌ها فقط برای هدایت توجه کاربرند، نه برای شلوغی بصری."
            />
            <div className="flex lg:justify-end">
              <Button variant="premium" size="lg" asChild>
                <Link to={ctaTo}>
                  محیط آزمون را تجربه کن <ArrowLeft />
                </Link>
              </Button>
            </div>
          </div>
          <div className="reveal mt-14">
            <DashboardMockup reducedMotion={reducedMotion} />
          </div>
        </div>
      </section>

      {(examsQuery.isLoading || exams.length > 0 || examsQuery.isError) && (
        <section id="exams" className="scroll-mt-24 py-24 lg:py-32">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <SectionTitle
                eyebrow="جدیدترین آزمون‌ها"
                title="آزمون‌های منتشرشده، آماده شرکت و تمرین"
              />
              <Button variant="soft" asChild>
                <Link to="/exams">
                  همه آزمون‌ها <ChevronLeft />
                </Link>
              </Button>
            </div>
            <div className="mt-10">
              {examsQuery.isLoading ? (
                <CardsLoading count={3} />
              ) : examsQuery.isError ? (
                <ErrorState error={examsQuery.error} onRetry={() => void examsQuery.refetch()} />
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {exams.map((exam) => (
                    <div key={exam.id} className="reveal">
                      <ExamCard exam={exam} isAuthed={isAuthed} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {(catalog?.organizations.length ?? 0) > 0 && (
        <section className="border-y border-border bg-surface-strong py-24 lg:py-32">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <SectionTitle
              eyebrow="سازمان‌ها و بانک‌ها"
              title="سازمان‌هایی که آزمون‌های استخدامی آن‌ها در سامانه موجود است"
            />
            <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {catalog!.organizations.map((org) => (
                <li
                  key={org.id}
                  className="reveal grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-border bg-background p-4 shadow-[var(--shadow-soft)]"
                >
                  {org.logo_url ? (
                    <img
                      src={org.logo_url}
                      alt={`نشان ${org.name}`}
                      loading="lazy"
                      className="size-8 shrink-0 rounded object-contain"
                    />
                  ) : (
                    <Building2 className="size-5 shrink-0 text-primary" aria-hidden="true" />
                  )}
                  <span className="truncate text-sm font-medium">{org.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {categories.length > 0 && (
        <section className="py-24 lg:py-32">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <SectionTitle
              eyebrow="دسته‌بندی آزمون‌ها"
              title="بر اساس نوع و حوزه آزمون، مسیر تمرین خود را انتخاب کنید"
            />
            <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((cat) => (
                <li key={cat.id} className="reveal">
                  <Link
                    to="/exams"
                    className="block rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow-soft)] transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
                      <FolderTree className="size-5 shrink-0 text-primary" aria-hidden="true" />
                      <p className="truncate font-medium text-foreground">{cat.name}</p>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatNumber(cat.exam_count)} آزمون
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="bg-foreground py-24 text-background lg:py-32">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <SectionTitle
            dark
            eyebrow="دو مسیر، دو نتیجه"
            title="اطلاعات را جمع نکن؛ آن را به عملکرد تبدیل کن"
          />
          <div className="mt-14 grid gap-5 md:grid-cols-2">
            <Compare title="مطالعه پراکنده و سنتی" muted items={BEFORE} />
            <Compare title="آمادگی هدفمند با همراه استخدام" items={AFTER} />
          </div>
        </div>
      </section>

      <section className="py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid gap-5 lg:grid-cols-3">
            {(
              [
                [
                  "سارا، داوطلب بانکداری",
                  "«قبلاً فقط تعداد ساعت مطالعه را می‌شمردم. گزارش‌ها نشان دادند مسئله اصلی من زمان‌بندی است؛ بعد از سه هفته، هم سرعتم بهتر شد هم آرامشم.»",
                ],
                [
                  "امیرحسین، پذیرفته‌شده آزمون دولتی",
                  "«روز آزمون حس نمی‌کردم وارد فضای ناشناخته‌ای شده‌ام. بارها همین فشار زمان را در همراه استخدام تجربه کرده بودم.»",
                ],
                [
                  "نرگس، داوطلب آموزش‌وپرورش",
                  "«به‌جای مرور بی‌پایان، دقیقاً مباحث ضعیفم را تمرین کردم. برای اولین بار می‌دانستم هر روز چرا و چه چیزی می‌خوانم.»",
                ],
              ] as const
            ).map(([name, quote]) => (
              <figure
                key={name}
                className="reveal rounded-[1.5rem] border border-border bg-surface-strong p-7 shadow-[var(--shadow-soft)]"
              >
                <div className="mb-6 flex gap-1 text-primary">★★★★★</div>
                <blockquote className="leading-8 text-foreground">{quote}</blockquote>
                <figcaption className="mt-6 border-t border-border pt-5 text-sm font-bold">
                  {name}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section
        id="pricing"
        className="scroll-mt-24 border-y border-border bg-surface-strong py-24 lg:py-32"
      >
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="reveal mx-auto max-w-2xl rounded-[1.5rem] border border-primary/40 bg-primary/5 p-8 text-center">
            <Sparkles className="mx-auto size-6 text-primary" />
            <h3 className="mt-3 text-xl font-bold text-foreground">
              اول امتحان کن، بعد تصمیم بگیر
            </h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
              ۷ روز رایگان شروع کن، سطح آمادگی‌ات را بسنج و بعد تصمیم بگیر.
            </p>
            <Button size="lg" variant="premium" className="mt-6" asChild>
              <Link to={ctaTo}>
                {ctaText} <ArrowLeft />
              </Link>
            </Button>
          </div>

          <div className="mt-16">
            <SectionTitle eyebrow="تعرفه‌ها" title="ماهانه، سه‌ماهه یا سالانه" />
          </div>

          <div className="mt-10">
            {plansQuery.isLoading ? (
              <CardsLoading count={3} />
            ) : plansQuery.isError ? (
              <ErrorState error={plansQuery.error} onRetry={() => void plansQuery.refetch()} />
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                {(plans.length > 0
                  ? plans.map((p) => ({
                      id: p.id,
                      title: p.title,
                      price: formatPrice(p.price),
                      months: p.duration_months,
                    }))
                  : [
                      { id: "m", title: "ماهانه", price: null as string | null, months: 1 },
                      { id: "q", title: "سه‌ماهه", price: null as string | null, months: 3 },
                      { id: "y", title: "سالانه", price: null as string | null, months: 12 },
                    ]
                ).map((plan, i) => (
                  <article
                    key={plan.id}
                    className={`reveal flex flex-col rounded-[1.5rem] border-t-2 bg-background p-7 shadow-[var(--shadow-soft)] ${i === 1 ? "border-primary" : "border-border"}`}
                    style={{ transitionDelay: `${i * 90}ms` }}
                  >
                    {i === 1 && (
                      <span className="mb-3 inline-block w-fit rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                        محبوب‌ترین انتخاب
                      </span>
                    )}
                    <h4 className="text-base font-bold text-foreground">{plan.title}</h4>
                    <p className="mt-3 text-2xl font-black text-primary">
                      {plan.price ?? "قیمت به‌زودی اعلام می‌شود"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatNumber(plan.months)} ماه دسترسی
                    </p>
                    <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 shrink-0 text-success" /> دسترسی کامل به
                        آزمون‌ها
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 shrink-0 text-success" /> تحلیل عملکرد و
                        دفتر اشتباهات
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 shrink-0 text-success" /> توضیح هوش مصنوعی
                        سؤال‌ها
                      </li>
                    </ul>
                    <Button className="mt-6 w-full" variant={i === 1 ? "premium" : "soft"} asChild>
                      <Link to={ctaTo}>{CTA_LABEL}</Link>
                    </Button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-24 py-24 lg:py-32">
        <div className="mx-auto grid max-w-6xl gap-14 px-5 lg:grid-cols-[.7fr_1.3fr] lg:px-8">
          <div>
            <span className="text-sm font-bold text-primary">پرسش‌های متداول</span>
            <h2 className="mt-4 text-3xl font-black leading-[1.5] md:text-4xl">
              پیش از شروع، هرچه باید بدانی
            </h2>
            <p className="mt-5 leading-8 text-muted-foreground">
              اگر پاسخ پرسشت را پیدا نکردی، تیم پشتیبانی همراه توست.
            </p>
          </div>
          <Accordion type="single" collapsible className="border-t border-border">
            {FAQ.map((f, i) => (
              <AccordionItem key={f[0]} value={`item-${i}`}>
                <AccordionTrigger className="py-6 text-right text-base hover:no-underline">
                  {f[0]}
                </AccordionTrigger>
                <AccordionContent className="pb-6 leading-8 text-muted-foreground">
                  {f[1]}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section id="final" className="px-5 pb-8 lg:px-8">
        <div className="cta-sheen relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-primary px-6 py-20 text-center text-primary-foreground md:px-12 md:py-28">
          <div className="absolute -right-20 -top-20 size-72 rounded-full border-[52px] border-primary-foreground/10" />
          <div className="absolute -bottom-28 -left-10 size-72 rounded-full border-[52px] border-foreground/10" />
          <p className="relative text-sm font-bold">قدم بعدی تو، همین حالا</p>
          <h2 className="relative mx-auto mt-5 max-w-3xl text-3xl font-black leading-[1.5] md:text-5xl">
            قبولی اتفاقی نیست؛ از آمادگی واقعی شروع می‌شود
          </h2>
          <p className="relative mx-auto mt-6 max-w-xl leading-8 text-primary-foreground/80">
            اولین شبیه‌سازی می‌تواند نقطه‌ای باشد که ابهام تمام می‌شود و مسیر روشن تو آغاز می‌شود.
          </p>
          <div className="relative mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Button variant="navy" size="lg" asChild>
              <Link to={ctaTo}>
                {ctaText} <ArrowLeft />
              </Link>
            </Button>
            <Button
              size="lg"
              className="border border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
              asChild
            >
              <Link to="/exams">مشاهده آزمون‌ها</Link>
            </Button>
          </div>
          <p className="relative mt-6 text-xs text-primary-foreground/70">{MICROCOPY}</p>
        </div>
      </section>

      {/* NEWSLETTER-SIGNUP */}
      <section className="px-5 pb-8 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <NewsletterSignup source="landing_page" />
        </div>
      </section>

      <footer className="border-t border-border py-14">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 md:grid-cols-4 lg:px-8">
          <div className="md:col-span-2">
            <BrandLogo />
            <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">
              همراه هوشمند شما برای آمادگی واقعی، تمرین هدفمند و ورود مطمئن به آزمون‌های استخدامی.
            </p>
          </div>
          <div>
            <h3 className="font-bold">دسترسی سریع</h3>
            <div className="mt-5 grid gap-3 text-sm text-muted-foreground">
              <a href="#features">امکانات</a>
              <a href="#journey">مسیر موفقیت</a>
              <Link to="/exams">همه آزمون‌ها</Link>
              <a href="#faq">پرسش‌های متداول</a>
            </div>
          </div>
          <div>
            <h3 className="font-bold">ارتباط با ما</h3>
            <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
              {supportEmail && (
                <p>
                  پشتیبانی:{" "}
                  <a href={`mailto:${supportEmail}`} dir="ltr" className="hover:text-foreground">
                    {supportEmail}
                  </a>
                </p>
              )}
              {supportPhone && (
                <p>
                  تلفن:{" "}
                  <a href={`tel:${supportPhone}`} dir="ltr" className="hover:text-foreground">
                    {supportPhone}
                  </a>
                </p>
              )}
            </div>
            {socialLinks.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {socialLinks.map((s) => (
                  <Social key={s.label} icon={s.icon} label={s.label} url={s.url} />
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mx-auto mt-12 flex max-w-7xl flex-col justify-between gap-3 border-t border-border px-5 pt-6 text-xs text-muted-foreground md:flex-row lg:px-8">
          <span>© ۱۴۰۵ همراه استخدام؛ همه حقوق محفوظ است.</span>
          <span>حریم خصوصی · قوانین استفاده</span>
        </div>
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur sm:hidden">
        <Button size="lg" variant="premium" className="w-full" asChild>
          <Link to={ctaTo}>
            {ctaText} <ArrowLeft />
          </Link>
        </Button>
      </div>
    </main>
  );
}

function SectionTitle({
  eyebrow,
  title,
  body,
  dark = false,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  dark?: boolean;
}) {
  return (
    <div className="reveal max-w-3xl">
      <span className="text-sm font-bold text-primary">{eyebrow}</span>
      <h2
        className={`mt-4 text-3xl font-black leading-[1.5] md:text-5xl ${dark ? "text-background" : "text-foreground"}`}
      >
        {title}
      </h2>
      {body && (
        <p
          className={`mt-5 max-w-2xl leading-8 ${dark ? "text-background/60" : "text-muted-foreground"}`}
        >
          {body}
        </p>
      )}
    </div>
  );
}

function BrandLogo() {
  const [failed, setFailed] = useState(false);

  return (
    <span className="flex h-11 items-center gap-3">
      {!failed ? (
        <img
          src={LOGO}
          alt="نشان همراه استخدام"
          className="h-11 w-auto max-w-44 object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <ListChecks className="size-6" />
          </span>
          <span className="flex flex-col leading-none">
            <strong className="text-sm font-black text-foreground">همراه استخدام</strong>
            <span className="mt-1 text-[10px] font-semibold text-muted-foreground">
              آزمون آنلاین و شبیه‌سازی
            </span>
          </span>
        </>
      )}
    </span>
  );
}

function DashboardMockup({
  hero = false,
  reducedMotion = false,
}: {
  hero?: boolean;
  reducedMotion?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setVisible(true);
        });
      },
      { threshold: 0.28 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal relative ${hero ? "lg:rotate-[-1deg]" : ""}`}>
      <div className="overflow-hidden rounded-[1.75rem] border border-border bg-surface-strong p-3 shadow-[var(--shadow-soft)] md:p-5">
        <div className="dash-grid rounded-[1.25rem] border border-border/50 bg-background/60 p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-success" />
              <span className="text-xs font-bold">آزمون شبیه‌سازی جامع</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-foreground px-3 py-2 font-mono text-xs text-background">
              <TimerReset className="size-4 text-primary" /> ۰۰:۴۲:۱۸
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-[1.35fr_.65fr]">
            <div className="rounded-[1.25rem] bg-muted/60 p-5">
              <div className="mb-4 flex justify-between text-xs text-muted-foreground">
                <span>روند عملکرد</span>
                <strong className="text-success">+۲۴٪ رشد</strong>
              </div>
              <div className="flex h-36 items-end gap-2 border-b border-border px-2">
                {[35, 48, 42, 62, 58, 77, 84].map((h, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t-md ${i === 6 ? "bg-primary" : "bg-primary/25"}`}
                    style={{
                      height: `${h}%`,
                      transformOrigin: "bottom",
                      transform: reducedMotion || visible ? "scaleY(1)" : "scaleY(.15)",
                      opacity: reducedMotion || visible ? 1 : 0.35,
                      transition: `transform 700ms cubic-bezier(.22,1,.36,1) ${i * 70}ms, opacity 700ms ease ${i * 70}ms`,
                    }}
                  />
                ))}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {["۸۲٪", "۷۶٪", "۱:۱۴"].map((x, index) => (
                  <div
                    key={x}
                    className="rounded-xl bg-surface-strong p-3 text-center"
                    style={{
                      transform: reducedMotion || visible ? "translateY(0)" : "translateY(10px)",
                      opacity: reducedMotion || visible ? 1 : 0,
                      transition: `transform 560ms ease ${260 + index * 70}ms, opacity 560ms ease ${260 + index * 70}ms`,
                    }}
                  >
                    <strong className="block text-lg">{x}</strong>
                    <span className="text-[10px] text-muted-foreground">
                      {index === 0 ? "دقت" : index === 1 ? "تسلط" : "زمان پاسخ"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div
                className="parallax-card rounded-[1.25rem] bg-success-soft p-4"
                style={{
                  transform: reducedMotion || visible ? "translateY(0)" : "translateY(14px)",
                  opacity: reducedMotion || visible ? 1 : 0,
                  transition:
                    "transform 700ms cubic-bezier(.22,1,.36,1) 180ms, opacity 700ms ease 180ms",
                }}
              >
                <CircleCheckBig className="size-5 text-success" />
                <p className="mt-6 text-xs font-bold">آمادگی کلی</p>
                <strong className="mt-1 block text-3xl">۷۸٪</strong>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-success/15">
                  <div
                    className="h-full rounded-full bg-success"
                    style={{
                      width: reducedMotion || visible ? "78%" : "0%",
                      transition: "width 950ms cubic-bezier(.22,1,.36,1) 320ms",
                    }}
                  />
                </div>
              </div>
              <div
                className="rounded-[1.25rem] border border-border p-4"
                style={{
                  transform: reducedMotion || visible ? "translateY(0)" : "translateY(14px)",
                  opacity: reducedMotion || visible ? 1 : 0,
                  transition:
                    "transform 700ms cubic-bezier(.22,1,.36,1) 280ms, opacity 700ms ease 280ms",
                }}
              >
                <p className="text-xs text-muted-foreground">تمرکز پیشنهادی</p>
                <strong className="mt-2 block text-sm">ریاضی و آمار</strong>
                <p className="mt-2 text-[10px] text-primary">۱۲ سؤال برای مرور</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      {hero && (
        <div className="absolute -bottom-7 -right-4 flex items-center gap-3 rounded-2xl border border-border bg-background/95 p-4 shadow-[var(--shadow-soft)] backdrop-blur md:-right-8">
          <div className="flex size-9 items-center justify-center rounded-full bg-success-soft">
            <TrendingUp className="size-5 text-success" />
          </div>
          <div>
            <strong className="block text-sm">روندت رو به رشد است</strong>
            <span className="text-[10px] text-muted-foreground">۳ آزمون پیاپی بهتر</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  suffix = "",
  delay = 0,
}: {
  value: number;
  label: string;
  suffix?: string;
  delay?: number;
}) {
  const [visible, setVisible] = useState(false);
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setVisible(true);
        });
      },
      { threshold: 0.45 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    const start = performance.now() + delay;
    const duration = 1100;

    const tick = (now: number) => {
      if (now < start) {
        frame = window.requestAnimationFrame(tick);
        return;
      }
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [delay, value, visible]);

  return (
    <div ref={ref} className="reveal bg-surface-strong p-7 text-center md:p-10">
      <strong className="block text-3xl font-black text-primary md:text-4xl">
        {formatNumber(display)}
        {suffix}
      </strong>
      <span className="mt-3 block text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Compare({
  title,
  items,
  muted = false,
}: {
  title: string;
  items: string[];
  muted?: boolean;
}) {
  return (
    <article
      className={`reveal rounded-[1.5rem] border p-7 md:p-9 ${muted ? "border-background/10 bg-background/5" : "border-primary/50 bg-primary/10"}`}
    >
      <h3 className={`text-xl font-black ${muted ? "text-background/70" : "text-primary"}`}>
        {title}
      </h3>
      <ul className="mt-7 space-y-5">
        {items.map((x) => (
          <li key={x} className="flex items-start gap-3 text-sm leading-7 text-background/70">
            {muted ? (
              <X className="mt-1 size-4 shrink-0 text-background/30" />
            ) : (
              <Check className="mt-1 size-4 shrink-0 text-success" />
            )}
            {x}
          </li>
        ))}
      </ul>
    </article>
  );
}

function Social({ icon: Icon, label, url }: { icon: LucideIcon; label: string; url: string }) {
  return (
    <Button variant="outline" size="icon" aria-label={label} title={label} asChild>
      <a href={url} target="_blank" rel="noopener noreferrer">
        <Icon className="size-4" />
      </a>
    </Button>
  );
}
