-- گزارش پیشرفت هفتگی با هوش مصنوعی — فقط افزایشی (additive)
-- صف و رفتار خبرنامه موجود تغییری نمی‌کند؛ فقط جدول/نما/توابع جدید.

create table if not exists public.ai_weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  content text,
  channels text[] not null default '{}'::text[],
  status text not null default 'pending', -- pending|generated|sent|failed|skipped
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.ai_weekly_reports enable row level security;

create index if not exists idx_ai_weekly_reports_week
  on public.ai_weekly_reports (week_start desc, status);

grant all on public.ai_weekly_reports to service_role;

-- کاربران فعالی که دوره ارسال هفتگی را انتخاب کرده‌اند
create or replace view public.ai_weekly_audience as
select
  p.id                                   as user_id,
  p.full_name,
  p.email,
  p.mobile,
  p.mobile_verified_at,
  s.id                                   as subscriber_id,
  s.status                               as subscriber_status,
  coalesce(pr.newsletter, false)         as newsletter_enabled,
  coalesce(pr.channel_email, false)      as email_enabled,
  coalesce(pr.channel_sms, false)        as sms_enabled,
  coalesce(pr.digest_frequency::text, 'instant') as digest_frequency
from public.profiles p
join public.newsletter_subscribers s on s.user_id = p.id
left join public.newsletter_preferences pr on pr.subscriber_id = s.id
where p.status = 'active'
  and s.status = 'active'
  and coalesce(pr.newsletter, false)
  and coalesce(pr.digest_frequency::text, 'instant') = 'weekly';

revoke all on public.ai_weekly_audience from anon, authenticated;
grant select on public.ai_weekly_audience to service_role;

-- آمار هفت روز گذشته یک کاربر (ورودی متن گزارش)
create or replace function public.ai_weekly_user_stats(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'practice_sessions', (
      select count(*) from public.practice_sessions ps
       where ps.user_id = p_user_id and ps.created_at >= now() - interval '7 days'),
    'practice_correct', (
      select coalesce(sum(ps.correct_count), 0) from public.practice_sessions ps
       where ps.user_id = p_user_id and ps.created_at >= now() - interval '7 days'),
    'practice_incorrect', (
      select coalesce(sum(ps.incorrect_count), 0) from public.practice_sessions ps
       where ps.user_id = p_user_id and ps.created_at >= now() - interval '7 days'),
    'exam_attempts', (
      select count(*) from public.exam_attempts ea
       where ea.candidate_id = p_user_id and ea.created_at >= now() - interval '7 days'),
    'exam_avg_percent', (
      select round(coalesce(avg(case when ea.total_score > 0
                                     then ea.earned_score * 100.0 / ea.total_score end), 0), 1)
        from public.exam_attempts ea
       where ea.candidate_id = p_user_id and ea.created_at >= now() - interval '7 days')
  );
$$;

grant execute on function public.ai_weekly_user_stats(uuid) to service_role;
