import {
  BarChart3,
  Bot,
  // SHOP-START
  ClipboardList,
  Package,
  ShoppingBag,
  Tag,
  // SHOP-END
  Building2,
  CreditCard,
  FileSpreadsheet,
  FileText,
  FlagTriangleRight,
  FolderTree,
  GraduationCap,
  History,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
  Mail,
  MessageSquare,
  PlusCircle,
  Newspaper,
  ScrollText,
  Send,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

export type AdminNavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** false while the screen is not implemented yet */
  ready?: boolean;
};

export type AdminNavGroup = {
  group: string;
  items: AdminNavItem[];
};

/** Persian, human-readable admin URLs. */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    group: "نمای کلی",
    items: [{ to: "/admin", label: "داشبورد مدیریت", icon: LayoutDashboard, ready: true }],
  },
  {
    group: "کاربران و دسترسی",
    items: [
      { to: "/admin/users", label: "کاربران", icon: Users, ready: true },
      { to: "/admin/subscriptions", label: "اشتراک‌ها", icon: CreditCard, ready: true },
    ],
  },
  {
    group: "مدیریت محتوا",
    items: [
      { to: "/admin/content", label: "مدیریت محتوا", icon: FolderTree, ready: true },
      { to: "/admin/exams", label: "مدیریت آزمون‌ها", icon: GraduationCap, ready: true },
      { to: "/admin/exams/new", label: "ایجاد آزمون", icon: PlusCircle, ready: true },
      { to: "/admin/questions", label: "بانک سوالات", icon: FileText, ready: true },
      { to: "/admin/categories", label: "دسته‌بندی‌ها", icon: FolderTree, ready: true },
      { to: "/admin/subjects", label: "دروس", icon: ListChecks, ready: true },
      { to: "/admin/organizations", label: "سازمان‌ها", icon: Building2, ready: true },
      { to: "/admin/bulk-import", label: "ورود گروهی سوال", icon: FileSpreadsheet, ready: true },
      {
        to: "/admin/bulk-import/history",
        label: "تاریخچه ورود گروهی",
        icon: History,
        ready: true,
      },
      {
        to: "/admin/question-reports",
        label: "گزارش سوالات",
        icon: FlagTriangleRight,
        ready: true,
      },
    ],
  },
  {
    group: "مالی",
    items: [
      { to: "/admin/payments", label: "پرداخت‌ها", icon: Wallet, ready: true },
      { to: "/admin/plans", label: "پلن‌ها", icon: CreditCard, ready: true },
    ],
  },
  {
    group: "تحلیل و پایش",
    items: [
      { to: "/admin/reports", label: "گزارش‌های مدیریتی", icon: BarChart3, ready: true },
      { to: "/admin/results", label: "نتایج آزمون‌ها", icon: ScrollText, ready: true },
      { to: "/admin/audit", label: "لاگ فعالیت‌ها", icon: ShieldCheck, ready: true },
      { to: "/admin/health", label: "سلامت سامانه", icon: HeartPulse, ready: true },
    ],
  },
  // NEWSLETTER-ADMIN — افزودنی، هیچ آیتم موجودی تغییر نکرده است
  {
    group: "خبرنامه",
    items: [
      { to: "/admin/newsletter", label: "خبرنامه", icon: Newspaper, ready: true },
      {
        to: "/admin/newsletter-subscribers",
        label: "مشترکان خبرنامه",
        icon: Mail,
        ready: true,
      },
      {
        to: "/admin/newsletter-deliveries",
        label: "صف و گزارش ارسال",
        icon: Send,
        ready: true,
      },
    ],
  },
  {
    group: "تنظیمات",
    items: [
      { to: "/admin/settings", label: "تنظیمات عمومی", icon: Settings, ready: true },
      { to: "/admin/ai", label: "هوش مصنوعی", icon: Bot, ready: true },
      { to: "/admin/sms", label: "پیامک", icon: MessageSquare, ready: true },
    ],
  },
  // SHOP-START — گروه فروشگاه (افزودنی؛ هیچ آیتم موجودی تغییر نکرده است)
  {
    group: "فروشگاه",
    items: [
      { to: "/admin/shop", label: "داشبورد فروشگاه", icon: ShoppingBag, ready: true },
      { to: "/admin/shop/products", label: "محصولات", icon: Package, ready: true },
      {
        to: "/admin/shop/categories",
        label: "دسته‌بندی‌های فروشگاه",
        icon: FolderTree,
        ready: true,
      },
      { to: "/admin/shop/orders", label: "سفارش‌ها", icon: ClipboardList, ready: true },
      { to: "/admin/shop/coupons", label: "کدهای تخفیف", icon: Tag, ready: true },
    ],
  },
  // SHOP-END
];

const LABELS = new Map<string, string>(
  ADMIN_NAV.flatMap((g) => g.items.map((i) => [i.to, i.label] as const)),
);

export function adminLabelFor(path: string): string | undefined {
  return LABELS.get(path);
}
