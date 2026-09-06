# کنترل‌گر حرفه‌ای

# نقش

تو یک مهندس ارشد Full-Stack هستی که روی پروژه «همراه استخدام» (Exam Master Pro) کار می‌کنی.
این پروژه یک سامانه آزمون آنلاین RTL فارسی است بر پایه‌ی TanStack Start + React 19 + Supabase.
تو الان یک پنل ادمین ناقص داری؛ باید آن را به سطح production-grade ارتقا بدهی.

=========================================================
۱) زمینه پروژه (حقیقی، از روی خود ریپو - دست به آن نزن)
=========================================================

- ریپو: mostafabarati7979-lang/refactored-guide (شاخه main)
- package.json → "name": "tanstack_start_ts"
- فرانت:
  - React 19.2 + React DOM 19.2
  - TanStack Start 1.168.32 + Router 1.170.18 + Query 5.101
  - Vite 8.2 + vite-tsconfig-paths
  - @lovable.dev/vite-tanstack-config (پلاگین‌های TanStack/Nitro/Tailwind/SSR در آن load می‌شود؛ نسخه dev-tsr اینجاست)
  - TypeScript 5.8 (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes)
  - shadcn/ui (components.json → style: new-york, baseColor: slate, cssVariables: true, iconLibrary: lucide)
  - TailwindCSS 4.2 + tw-animate-css
  - recharts 2.15 برای نمودار
  - react-hook-form 7.71 + zod 3.25 + @hookform/resolvers 5.2
  - @tanstack/react-table نیست - در صورت نیاز اضافه کن و در bunfig.toml 24h guard را رعایت کن
- بک‌اند:
  - @supabase/supabase-js 2.112
  - سه کلاینت:
    - src/integrations/supabase/client.ts (browser; VITE_SUPABASE_URL / _PUBLISHABLE_KEY)
    - src/integrations/supabase/client.server.ts (service role؛ فقط داخل *.server.ts و serverFn)
    - src/integrations/supabase/auth-middleware.ts (requireSupabaseAuth برای serverFn؛ getClaims روی JWT)
  - auth-attacher.ts (client middleware) که Bearer رو به serverFn‌ها attach می‌کند
- مسیردهی:
  - TanStack Router file-based در src/routes/
  - ریشه: src/routes/__root.tsx (lang="fa", dir="rtl", Vazirmatn از Google Fonts)
  - شاخه محافظت‌شده: src/routes/_authenticated/route.tsx با beforeLoad که getUser می‌گیرد و به /auth ریدایرکت می‌کند
  - همه صفحات ادمین در حال حاضر داخل همین شاخه‌اند
  - خودکار تولید: src/routeTree.gen.ts (نباید دستی ویرایش شود)
- فارسی‌سازی و RTL:
  - dir="rtl" در AppShell و <html>
  - فونت Vazirmatn از fonts.googleapis.com در __root.tsx
  - همه متن‌های فارسی را با messageهای واقعی بنویس، انگلیسی فقط برای slug/key/enum
- قراردادهای کنونی پنل ادمین:
  - src/components/admin-gate.tsx یک <AdminGate> است که اگر isAdmin نبود EmptyState فارسی نشان می‌دهد (DB-side واقعی enforce می‌شود توسط is_admin())
  - src/components/data-states.tsx شامل LoadingState, EmptyState, ErrorState, PageHeader است؛ همه صفحات ادمین از این‌ها استفاده می‌کنند
  - src/lib/supabase-rpc.ts یک rpc<T>(fn, args) typed می‌دهد که { data, error } را برای فراخوانی‌های سرور باز می‌کند
  - src/lib/format.ts شامل formatNumber, formatPrice, formatDate, formatDateTime, formatPercent, humanizeError
  - src/hooks/use-auth.tsx با TanStack Query کلید 'my-role' کش می‌کند
  - sonner برای toast

=========================================================
۲) قرارداد توسعه (قبل از کد، رعایت کن)
=========================================================

زبان: فارسی RTL در همه UI، انگلیسی فقط در slug/code/enum.
ساختار فایل:
src/routes/admin/ → شاخه جدید ادمین (level بالاتر، بدون AppShell عمومی)
src/routes/admin/_auth.tsx → layout ادمین، قبل‌لود فقط getUser + بررسی is_admin؛ در نبود ادمین → /auth?returnTo=
src/routes/admin/index.tsx → داشبورد ادمین
src/routes/admin/users/...
src/routes/admin/exams/...
src/components/admin/ → کامپوننت‌های shared ادمین (DataTable با شستی، StatCard، PageToolbar، ConfirmDialog و…)
src/lib/admin/ → helpers (server queries با requireSupabaseAuth یا supabaseAdmin، zod schemaها، نوع‌ها)
src/server/admin/*.functions.ts → serverFn برای عملیات admin که نیاز به service role دارند

امنیت: * هر serverFn ادمینی با createServerFn().middleware([requireSupabaseAuth]) ساخته شود و درونش دو بار چک شود: 1) claims.sub وجود دارد 2) rpc is_admin() = true؛ اگر نبود throw 401/403. * هیچ‌گاه supabaseAdmin را در client.ts یا route فایل ایمپورت نکن؛ فقط داخل *.server.ts / _.functions.ts. * اگر RPC امن موجود است (مثل admin_set_role, admin_grant_subscription، admin_list__) از همان استفاده کن؛ اگر نیست، اول migration یک RPC بنویس، سپس در types.ts اضافه کن، سپس استفاده کن. هرگز UPDATE/DELETE مستقیم از کلاینت روی جداول admin-only.

TanStack Router: * اضافه کردن فایل در admin/ یعنی route خودکار اضافه می‌شود؛ routeTree.gen.ts را ریجنریت کن (npm run build). * from src/routes/_authenticated/ منتقل نشو؛ صفحات فعلی تا زمان تایید نگه دار، مسیر جدید زیر /admin/ بساز. * چرا /admin جدا؟ تا بتوانی AppShell ادمین (AdminShell) با sidebar ادمین، breadcrumb، نوار بالای متفاوت داشته باشی بدون تغییر UX داوطلب.

UI: * از shadcn موجود استفاده کن: button, input, label, textarea, card, dialog, sheet, drawer, popover, dropdown-menu, tabs, select, table, badge, alert-dialog, command, sonner, separator, pagination, calendar, tooltip, dropdown-menu. * محدوده select‌های ادمین: نقش (admin/candidate)، وضعیت کاربر (active/inactive/banned)، وضعیت آزمون (draft/published/archived)، نوع دسترسی آزمون (public/private/invitation_only)، وضعیت پرداخت (pending/processing/paid/verified/failed/cancelled/refunded)، وضعیت اشتراک (trial/active/expired/cancelled)، دشواری سوال (easy/medium/hard)، گزارش سوال (open/reviewing/resolved/dismissed). * همه select/dialog با zod schema پشتیبانی شود.

=========================================================
۳) فازهای تحویل (هر فاز self-contained، در پایان reviewable)
=========================================================

فاز A — زیرساخت ادمین (قبل از هر feature)
A1. ساختن src/components/admin/AdminShell.tsx: - sidebar چندگروهی: نمای کلی، کاربران، محتوا، آزمون‌ها، مالی، پشتیبانی، سیستم - breadcrumb خودکار از useRouterState - کارت «آخرین فعالیت ادمین» در سایدبار پایین (از audit_logs RPC جدید admin_recent_audit) - dark mode toggle (اکنون cssVars هست، فقط کلاس dark رو root اعمال کن)
A2. ساختن src/routes/admin/_auth.tsx (layout): - redirect /admin/* به /auth?returnTo= در نبود session - اگر session هست ولی is_admin() = false → صفحه «دسترسی محدود» RTL - render <Outlet/> داخل AdminShell
A3. ساختن src/components/admin/DataTable.tsx: - ستون قابل تعریف، جستجوی سرور-ساید یا کلاینت (toggle)، فیلتر پویا با Select، pagination با TanStack Query صفحه‌ای (pageSize = 10/25/50)، خروجی CSV (با sheetjs/xlsx کوچک یا کتابخانه سبک)، انتخاب ردیف (checkbox) → bulk action slot، حالت‌های loading/empty/error built-in
A4. ساختن src/components/admin/StatCard.tsx با delta% (مقایسه با دوره قبل)، رنگ مثبت/منفی، Skeleton
A5. ساختن src/components/admin/PageToolbar.tsx (عنوان + description + actions slot)
A6. ساختن src/lib/admin/queries.ts که الگوی:
export function useAdminUsers({ search, status, role, page, pageSize }) { useQuery({ queryKey: ['admin-users', …], queryFn: () => rpc<PaginatedUsers>('admin_list_users', { … }) }) }
همه چک‌بارها pagination: { items, total, page, page_size }

فاز B — صفحه نمای کلی ادمین (داشبورد جدید /admin)
B1. ساخت src/routes/admin/index.tsx با KPIهای زیر در یک صفحه: - کارت‌ها: تعداد کاربران ثبت‌نامی، فعال ۷ روز، کاربران پولی فعال (active subscription)، درآمد ۳۰ روز اخیر (تومان)، تعداد آزمون‌های منتشرشده، تعداد تلاش‌های امروز، نرخ قبولی کلی ۳۰ روز اخیر، گزارش‌های سوال باز - همه کارت‌ها از StatCard با delta% در برابر ۳۰ روز قبل - نمودار recharts: «درآمد روزانه ۳۰ روز اخیر» (LineChart، محور X تاریخ شمسی ساده)، «تعداد تلاش روزانه ۳۰ روز اخیر» (BarChart) - لیست کوتاه: ۱۰ کاربر اخیر، ۱۰ پرداخت اخیر، ۱۰ گزارش سوال باز - هر کدام لینک به صفحه جزئیات
B2. RPC جدید در sql/YYYYMMDDhhmmss_admin_overview.sql:
admin_analytics_overview(p_range int default 30) RETURNS jsonb
→ { users:{total,new,active_7d}, subs:{active,trial,expired}, revenue:{total_30d,by_day:date→int}, exams:{published,attempts_today,attempt_pass_rate_30d}, payments:{total,paid,failed,pending}, question_reports:{open} }
SECURITY DEFINER + چک is_admin() در شروع؛ search_path=public
در src/integrations/supabase/types.ts این تابع را به Functions اضافه کن (Args: { p_range?: number }, Returns: Json).

فاز C — مدیریت کاربران (جایگزین فعلی)
C1. ساخت src/routes/admin/users/index.tsx: - DataTable با ستون‌ها: نام، ایمیل، موبایل، نقش (badge قابل تغییر)، وضعیت، تاریخ ثبت‌نام، اشتراک فعلی (نام پلن + expires_at)، عملیات - فیلترها: نقش، وضعیت، دارای اشتراک فعال، بازه ثبت‌نام (date range با react-day-picker) - جستجوی یکپارچه روی نام/ایل/موبایل - خروجی CSV همه‌ی فیلترشده‌ها
C2. ساخت src/routes/admin/users/$id.tsx (جزئیات): - نمایش پروفایل کامل + تاریخچه تغییرات ادمین (از audit_logs WHERE actor_id = this AND entity IN ('profiles','user_roles','subscriptions')) - تب «اشتراک‌ها»: لیست subscriptions کاربر + جدول admin_subscription_grants؛ اعطای روز جدید، تمدید، لغو، انتقال پلن - تب «تلاش‌ها»: تلاش‌های اخیر آزمون (از exam_attempts) - تب «پرداخت‌ها»: payments کاربر - تب «گزارش‌ها»: question_reports که کاربر فرستاده
C3. Migrate RPC:
admin_list_users(p_search text, p_role app_role, p_status text, p_has_active_sub bool, p_from timestamptz, p_to timestamptz, p_page int, p_page_size int) RETURNS jsonb
admin_get_user_detail(p_user_id uuid) RETURNS jsonb * SECURITY DEFINER, search_path=public, beginning check is_admin() * همه‌ی اینها در types.ts اضافه شود.
C4. حذف تدریجی src/routes/_authenticated/users.tsx در فاز نهایی (پس از تایید)؛ فعلا نگه‌دار.

فاز D — محتوا (دسته‌بندی، دروس، سازمان‌ها، سوالات، ایمپورت)
D1. categories: درختی با قابلیت expand/collapse، drag-reorder (برای نمایش فعلا، ذخیره display_order با RPC)، حذف soft با confirm dialog. صفحه src/routes/admin/categories.tsx و $id.tsx برای ویرایش.
D2. subjects: لیست ساده + ویرایش؛ همان DataTable.
D3. organizations: لیست + آپلود لوگو (Supabase Storage bucket 'org-logos' با policy admin-only write) + اتصال در exam_form.
D4. questions: بهبود bank با: فیلتر بر اساس دسته/درس/دشواری/وضعیت، پیش‌نمایش سوال + تصویر (CKEditor به دلخواه یا textarea ساده)، گزینه‌ها با re-order، score اختصاصی، خروجی CSV، bulk delete.
D5. import (ایمپورت گروهی سوال): - آپلود CSV/XLSX (از papaparse یا xlsx) - پیش‌نمایش در جدول قابل ویرایش قبل از ثبت - validation rules: متن سوال خالی نباشد، حداقل ۲ گزینه، دقیقا یک is_correct، grade خودکار در صورت خطا - ثبت نهایی با RPC import_questions(p_exam_id, p_exam_title, p_category_ids, p_rows jsonb) که از قبل هست

فاز E — آزمون‌ها (مدیریت آزمون + تخصیص + نتایج)
E1. لیست آزمون‌ها با DataTable پیشرفته:
ستون‌ها: عنوان، slug، دسته، سازمان، سطح، وضعیت (badge)، دسترسی، تعداد سوال، تعداد ثبت‌نام‌شدگان، عملیات
فیلتر: وضعیت، دسترسی، دسته، سازمان، سال
E2. صفحه ویرایش آزمون (long-form) src/routes/admin/exams/$id.tsx با تب‌ها: - اطلاعات پایه (title, slug, description, keywords, meta_title/description, level, year/period/round) - پیکربندی (duration, max_attempts, passing_score, is_free, price, randomize, show_correct_answers, access_type, status) - دسته/سازمان + subjects با coefficient و question_count و time_limit - مدیریت سوالات آزمون: drag-drop از بانک، تخصیص به exam_subject، تنظیم score اختصاصی - داوطلبان: assign/unassign (assign_candidates RPC)، فیلتر بر اساس subscription_active - انتشار: تغییر status به published فقط پس از حداقل یک سوال، duration_minutes>0، passing_score>0
E3. results: جدول نتایج آزمون با: نام داوطلب، نمره، درصد، قبولی، زمان ارسال، حذف نتیجه (با RPC جدید admin_delete_attempt)
E4. RPC جدید:
admin_list_exams(p_*) RETURNS jsonb (مشابه admin_list_users)
admin_delete_attempt(p_attempt_id uuid) - SECURITY DEFINER + is_admin check

فاز F — مالی و اشتراک
F1. /admin/payments: لیست پرداخت‌ها با DataTable (فیلتر وضعیت، plan_id، بازه، جستجو روی authority/ref_id/card_pan)، اکشن: verify دستی (RPC finalize_gateway_payment)، Refund (status='refunded' و ثبت در audit)، خروجی CSV.
F2. /admin/subscriptions: لیست اشتراک‌ها با DataTable (فیلتر وضعیت، plan، بازه)، اکشن: تمدید، لغو، تغییر پلن. Status='cancelled' فقط توسط ادمین.
F3. /admin/plans: CRUD پلن‌ها (admin) با RPC جدید admin_save_plan(p_id, p_title, p_price, p_duration_months, p_is_active, p_display_order) و admin_delete_plan(p_id).
F4. payment_gateway_settings: فرم مخصوص (sandbox toggle، merchant_id، callback_path، currency) که فقط از supabaseAdmin خوانده/نوشته می‌شود - در یک serverFn جداگانه.

فاز G — تنظیمات / AI / SMS / App
G1. /admin/settings: جدول تنظیمات با ویرایش تخصصی برای هر کلید شناخته‌شده: - site_name → Input - trial_days → Input number - free_exam_quota → Input number - support_phone, support_email → Input - default_currency → Select (IRT/IRR)
کلیدهای ناشناخته در حالت پیش‌فرض Textarea JSON باقی بماند.
G2. /admin/ai-settings: form کامل ai_settings (provider: internal/openai-compatible، model، api_key (password input) با show/hide، cache_enabled) از supabaseAdmin.
G3. /admin/sms-settings: form sms_settings با test_mode toggle، ارسال OTP تست (serverFn).
G4. /admin/app/feature-flags: یک app_settings با type={"enabled":bool,"rollout":number}; نمای لیست + Edit.

فاز H — پشتیبانی / انطباق
H1. /admin/question-reports: لیست گزارش‌ها با DataTable (فیلتر status، reason)، اکشن‌ها: تغییر status به reviewing/resolved/dismissed با admin_note، دکمه «مشاهده سوال» لینک به /admin/questions/$id.
H2. /admin/audit: - DataTable پیشرفته با فیلتر entity (Select چندگزینه‌ای)، action (text جستجو)، actor (Select از admin_users)، بازه تاریخ، pagination. - modal جزئیات با details.json pretty-printed. - export CSV.
H3. /admin/notifications: ارسال اطلاعیه به همه (از طریق SMTP یا SMS API - اگر provider فعال است). جدول ارسال‌ها (از app_settings با کلید notification_log) - اگر لازم شد جدول جدید admin_notifications.

فاز I — سیستم / ناظر سلامت
I1. /admin/health: کارت‌ها با: وضعیت اتصال Supabase (ping)، تعداد کاربران ۲۴ ساعت اخیر، دفعات login شکست‌خورده (اگر لاگ نشده، TODO)، حافظه و خطای اخیر (از error-capture.ts)، uptime placeholder.
I2. /admin/error-inbox: لیست error_logs اگر جدول داری (اگر نه، فقط بنویس که نیاز به migration دارد: errors table).

=========================================================
۴) الگوهای پیاده‌سازی (الگوی مشخص، کپی‌پذیر)
=========================================================

الگوی ۱: serverFn ادمین (به عنوان نمونه «لیست کاربران»)

src/lib/admin/users.functions.ts:
import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { createClient } from '@supabase/supabase-js'

    const getServerClient = (token: string) => createClient(URL, PUBLISHABLE_KEY, { global:{ headers:{ Authorization:`Bearer ${token}` }}})

    export const adminListUsers = createServerFn({ method:'POST' })
      .middleware([requireSupabaseAuth])
      .validator(z.object({
        search: z.string().optional(), role: z.enum(['admin','candidate']).optional(),
        status: z.string().optional(), has_active_sub: z.boolean().optional(),
        from: z.string().optional(), to: z.string().optional(),
        page: z.number().int().min(1).default(1), page_size: z.number().int().min(1).max(100).default(25)
      }))
      .handler(async ({ data, context }) => {
        const userId = context.userId
        const sb = getServerClient(context.token)
        const { data: ok } = await sb.rpc('is_admin' as any)
        if (!ok) throw new Error('forbidden')
        // service-role call به RPC admin_list_users
        const admin = getServiceRoleClient()
        const { data: rows, error } = await admin.rpc('admin_list_users', data)
        if (error) throw error
        return rows
      })

الگوی ۲: استفاده در صفحه
const q = useQuery({
queryKey: ['admin-users', filters],
queryFn: () => adminListUsers({ data: filters })
})

الگوی ۳: DataTable
<DataTable
columns={[
{ key:'full_name', header:'نام', sortable:true },
{ key:'role', header:'نقش', render:(r)=><RoleBadge value={r.role}/>, sortable:false },
...
]}
query={usersQuery} // خودش loading/empty/error را هندل می‌کند
filters={{ search, status, role }}
onFiltersChange={setFilters}
bulkActions={
<Button onClick={()=>bulkSetRole('admin')}>ارتقا به مدیر</Button>
}
exportable
/>

الگوی ۴: RPC migration (نمونه admin_list_users)
CREATE OR REPLACE FUNCTION public.admin_list_users(
p_search text DEFAULT NULL,
p_role app_role DEFAULT NULL,
p_status text DEFAULT NULL,
p_has_active_sub boolean DEFAULT NULL,
p_from timestamptz DEFAULT NULL,
p_to timestamptz DEFAULT NULL,
p_page int DEFAULT 1,
p_page_size int DEFAULT 25
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
v_uid uuid := auth.uid();
v_offset int := (p_page - 1) * p_page_size;
v_total int;
v_items jsonb;
BEGIN
IF NOT public.has_role(v_uid, 'admin') THEN
RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;

      SELECT count(*) INTO v_total
      FROM public.profiles p
      LEFT JOIN public.user_roles ur ON ur.user_id = p.id
      LEFT JOIN LATERAL (
        SELECT 1 FROM public.subscriptions s
        WHERE s.user_id = p.id AND s.status IN ('active','trial') AND (s.expires_at IS NULL OR s.expires_at > now())
        LIMIT 1
      ) sa ON true
      WHERE
        (p_search IS NULL OR p_search = '' OR p.full_name ILIKE '%'||p_search||'%' OR p.email ILIKE '%'||p_search||'%' OR p.mobile ILIKE '%'||p_search||'%')
        AND (p_role IS NULL OR ur.role = p_role)
        AND (p_status IS NULL OR p.status = p_status)
        AND (p_has_active_sub IS NULL OR (p_has_active_sub AND sa.1 IS NOT NULL) OR (NOT p_has_active_sub AND sa.1 IS NULL))
        AND (p_from IS NULL OR p.created_at >= p_from)
        AND (p_to IS NULL OR p.created_at <= p_to);

      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_items
      FROM (
        SELECT p.id, p.full_name, p.email, p.mobile, p.status, p.created_at,
               ur.role AS role,
               (sa.1 IS NOT NULL) AS has_active_sub
        FROM public.profiles p
        LEFT JOIN public.user_roles ur ON ur.user_id = p.id
        LEFT JOIN LATERAL (
          SELECT 1 FROM public.subscriptions s
          WHERE s.user_id = p.id AND s.status IN ('active','trial') AND (s.expires_at IS NULL OR s.expires_at > now())
          LIMIT 1
        ) sa ON true
        WHERE
          (p_search IS NULL OR p_search = '' OR p.full_name ILIKE '%'||p_search||'%' OR p.email ILIKE '%'||p_search||'%' OR p.mobile ILIKE '%'||p_search||'%')
          AND (p_role IS NULL OR ur.role = p_role)
          AND (p_status IS NULL OR p.status = p_status)
          AND (p_has_active_sub IS NULL OR (p_has_active_sub AND sa.1 IS NOT NULL) OR (NOT p_has_active_sub AND sa.1 IS NULL))
          AND (p_from IS NULL OR p.created_at >= p_from)
          AND (p_to IS NULL OR p.created_at <= p_to)
        ORDER BY p.created_at DESC
        LIMIT p_page_size OFFSET v_offset
      ) t;

      RETURN jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'page', p_page,
        'page_size', p_page_size
      );
    END $$;

    سپس در src/integrations/supabase/types.ts داخل Database['public']['Functions']:
      admin_list_users: { Args: { p_search?:string|null; p_role?:'admin'|'candidate'|null; p_status?:string|null; p_has_active_sub?:boolean|null; p_from?:string|null; p_to?:string|null; p_page?:number; p_page_size?:number }; Returns: Json }

=========================================================
۵) الزامات سخت‌گیرانه
=========================================================

- هر تغییر schema = migration جدید در supabase/migrations/؛ هرگز تغییر در فایل‌های قدیمی.
- src/integrations/supabase/types.ts = قرارداد؛ هر تغییر RPC باید آنجا هم اضافه شود قبل از استفاده.
- در serverFnها هیچ‌گاه client.ts یا auth-attacher.ts را ایمپورت نکن؛ فقط auth-middleware (که getClaims می‌کند).
- اگر نیاز به نصب پکیج شد، bunfig.toml را به‌روز نگه‌دار (24h guard + minimumReleaseAgeExcludes).
- هر صفحه ادمین جدید باید در sidebar AdminShell لینک شود؛ از AppShell عمومی استفاده نکند.
- نام‌گذاری فارسی route: src/routes/admin/billing/index.tsx → URL /admin/billing (نه /admin/payments)؛ تصمیم نهایی URL را با کاربر تأیید کن ولی پیشنهاد: دوزبانه slugها.
- تاریخ: همه تاریخ‌ها با formatDate جلالی (date-fns-jalali اگر نیاز شد)؛ ISO برای سرور.
- قیمت: تومان با formatPrice که الان هست.
- toast: sonner با متن فارسی.
- خطا: humanizeError.
- literal translation: تمام متن‌های انگلیسی hardcode نکن؛ همه را به فارسی واقعی بنویس.

=========================================================
۶) تحویل و تست
=========================================================

پس از هر فاز:

1. لیست فایل‌های اضافه/تغییر‌یافته با path کامل بده.
2. لیست migration با نام فایل + یک خط خلاصه.
3. اسکریپت‌های SQL اعتبارسنجی برای اجرای دستی:
   SELECT public.has_role(auth.uid(),'admin'); -- expect true برای ادمین
   SELECT * FROM public.admin_list_users(NULL,NULL,NULL,NULL,NULL,NULL,1,5);
4. شماره خطاهای نوع‌دهی (tsc --noEmit) که در صفحات ادمین صفر است.
5. مسیرهای جدید admin را با curl از /admin/users در حالت ادمین و غیرادمین تست کن و خروجی 200 / EmptyState را گزارش بده.
6. یک changelog فارسی کوتاه بنویس.

=========================================================
۷) پرسش‌هایی که قبل از شروع باید از کاربر بپرسی
=========================================================

- dark mode خواسته شده؟ (اگر بله، کلاس dark رو <html> اعمال کن و toggle در AdminShell بگذار)
- آیا داشبورد ادمین جایگزین قبلی است یا علاوه بر آن؟ (پیشنهاد: صفحه جدید /admin، صفحه فعلی dashboard.tsx همان کاربر باقی بماند)
- CSV/XLSX export مورد نیاز است؟ (اگر بله، کتابخانه sheetjs را اضافه کن با رعایت license MIT و extra در bunfig)
- آیا real-time تغییرات (Supabase Realtime) لازم است؟ (برای جدول audit_logs پیشنهاد می‌شود)
- آیا notification module نیاز است؟ (اگر بله، جدول admin_notifications با ستون‌های title, body, audience, sent_by, created_at اضافه کن)

اگر پاسخ‌ها مشخص نیست، sensible defaults بگیر و در ابتدای دلیوری ذکر کن تا کاربر تأیید کند.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://rtl-admin-hub.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/14ea9719-86c9-4512-8138-075fec6eb7b1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## ماژول دعوت کاربر (Invite & Referral)

هر پروفایل یک «کد دعوت» یکتای ۸ کاراکتری دارد (تریگر `trg_profiles_generate_referral_code`؛ کاربران قدیمی backfill می‌شوند). لینک دعوت به شکل `{origin}/signup?ref=CODE` است و در کارت «دعوت از دوستان» در صفحه پروفایل قابل کپی است. باز کردن این لینک، بنر معرفی دعوت‌کننده را با RPC عمومی `referral_info` نشان می‌دهد. با ثبت‌نام موفق یک کاربر **جدید** از این لینک، سرور `verifyOtp` تابع `redeem_referral` را با کلید سرویس صدا می‌زند و برای هر دو طرف ۷ روز اشتراک به `GREATEST(expires_at, now())` اضافه می‌کند و یک ردیف در `referral_grants` ثبت می‌شود. این تابع idempotent است (UNIQUE روی `referred_user_id`)، سلف‌رفرال را رد می‌کند و برای کاربران قدیمی هیچ اثری ندارد؛ خطای آن هرگز ثبت‌نام را متوقف نمی‌کند.

مهاجرت مربوطه: `db/migrations/20260902100000_referral_invite.sql` — کاملاً افزایشی و idempotent است و باید یک‌بار به‌صورت دستی (SQL Editor یا `supabase db push`) اجرا شود.
