-- =====================================================================
-- Newsletter subscribers — additive patch (landing signup)
-- ایمن و idempotent: هیچ DROP / تغییر ستون موجود / تغییر مخرب ندارد.
-- پیش‌نیاز: 20260824090000_newsletter_core.sql (جدول و RLS موجود)
-- =====================================================================

-- 1. ستون اختیاری نام (برای فرم عضویت لندینگ‌پیج)
alter table public.newsletter_subscribers
  add column if not exists name text default null;

-- 2. ایندکس تاریخ ثبت (برای جدول مدیریت و آمار ماه جاری)
create index if not exists idx_newsletter_subscribers_created_at
  on public.newsletter_subscribers (created_at desc);

create index if not exists idx_newsletter_subscribers_status
  on public.newsletter_subscribers (status);

-- 3. نگه‌داشتن updated_at (فقط برای همین جدول، additive)
create or replace function public.newsletter_subscribers_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  create trigger trg_newsletter_subscribers_updated_at
    before update on public.newsletter_subscribers
    for each row execute function public.newsletter_subscribers_touch_updated_at();
exception when duplicate_object then null; end $$;

-- 4. نرمال‌سازی ایمیل سمت دیتابیس (trim + lowercase) — لایه دوم دفاعی؛
--    نرمال‌سازی اصلی در فرم/کلاینت انجام می‌شود.
create or replace function public.newsletter_subscribers_normalize_email()
returns trigger
language plpgsql
as $$
begin
  if new.email is not null then
    new.email = lower(btrim(new.email));
  end if;
  if new.name is not null then
    new.name = nullif(btrim(new.name), '');
  end if;
  return new;
end;
$$;

do $$ begin
  create trigger trg_newsletter_subscribers_normalize
    before insert or update on public.newsletter_subscribers
    for each row execute function public.newsletter_subscribers_normalize_email();
exception when duplicate_object then null; end $$;

-- 5. سیاست‌های RLS موجود دست‌نخورده می‌مانند:
--    anon → فقط INSERT مهمان (status='pending', user_id is null)
--    authenticated → رکورد خودش / ادمین با public.is_admin()
--    خواندن، ویرایش و حذف مشترکان در پنل از طریق server function ادمین انجام
--    می‌شود که نقش مدیر را با RPC is_admin بازبینی می‌کند.
