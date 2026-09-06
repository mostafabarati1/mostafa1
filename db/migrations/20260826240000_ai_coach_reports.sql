-- تاریخچه گزارش‌های مربی هوشمند — فقط افزایشی (additive)
-- رفتار مربی فعلی تغییری نمی‌کند؛ فقط جدول جدید برای نگهداری تاریخچه گزارش‌ها
-- و توابع امنیتی برای افزودن (append-only) و خواندن گزارش‌های خود کاربر.

create table if not exists public.ai_coach_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  period_from date,
  period_to date,
  level text,
  headline text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ai_coach_reports enable row level security;

create index if not exists idx_ai_coach_reports_user
  on public.ai_coach_reports (user_id, created_at desc);

-- کاربر فقط گزارش‌های خودش را می‌بیند
create policy ai_coach_reports_select_own
  on public.ai_coach_reports for select
  to authenticated
  using (user_id = auth.uid());

-- service_role دسترسی کامل دارد (کارهای پس‌زمینه/مدیریتی)
grant all on public.ai_coach_reports to service_role;
revoke all on public.ai_coach_reports from anon, authenticated;

-- افزودن یک گزارش جدید برای کاربر جاری (append-only؛ حذف/ویرایش نداریم)
create or replace function public.ai_coach_report_append(
  p_period_from date,
  p_period_to date,
  p_level text,
  p_headline text,
  p_summary jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ورود لازم است';
  end if;

  insert into public.ai_coach_reports (user_id, period_from, period_to, level, headline, summary)
  values (auth.uid(), p_period_from, p_period_to, p_level, p_headline, coalesce(p_summary, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end $$;

grant execute on function public.ai_coach_report_append(date, date, text, text, jsonb) to authenticated;

-- فهرست گزارش‌های پیشین کاربر جاری (جدیدترین اول)
create or replace function public.ai_coach_reports_list_mine(p_limit int default 10)
returns setof public.ai_coach_reports
language sql
stable
security definer
set search_path = public
as $$
  select *
    from public.ai_coach_reports
   where user_id = auth.uid()
   order by created_at desc
   limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

grant execute on function public.ai_coach_reports_list_mine(int) to authenticated;

-- آخرین گزارش کاربر جاری (برای مصرف داخلی هنگام تحلیل جدید)
create or replace function public.ai_coach_report_latest_mine()
returns public.ai_coach_reports
language sql
stable
security definer
set search_path = public
as $$
  select *
    from public.ai_coach_reports
   where user_id = auth.uid()
   order by created_at desc
   limit 1;
$$;

grant execute on function public.ai_coach_report_latest_mine() to authenticated;
