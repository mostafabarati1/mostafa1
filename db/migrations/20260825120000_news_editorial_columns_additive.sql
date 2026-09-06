-- ---------------------------------------------------------------------
-- افزودنی و idempotent: ستون‌های تحریریه‌ای جدول news
-- جدول news در پایگاه‌داده از قبل وجود داشت، بنابراین
-- «create table if not exists» در 20260824090000_newsletter_core.sql
-- ستون‌های زیر را اضافه نکرد و کوئری ادمین با خطای
-- «column news.source_url does not exist» شکست می‌خورد.
-- هیچ ستون، ایندکس یا سیاست موجودی حذف یا تغییر نمی‌کند.
-- ---------------------------------------------------------------------

alter table public.news add column if not exists source_url text;
alter table public.news add column if not exists is_important boolean not null default false;
alter table public.news add column if not exists tags text[] not null default '{}'::text[];
alter table public.news add column if not exists seo_title text;
alter table public.news add column if not exists seo_description text;
alter table public.news add column if not exists scheduled_at timestamptz;

create index if not exists idx_news_important on public.news (is_important) where is_important;
create index if not exists idx_news_scheduled on public.news (scheduled_at);
