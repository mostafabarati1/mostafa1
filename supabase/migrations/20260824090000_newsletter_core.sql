-- =====================================================================
-- Newsletter / Notification platform — core schema
-- اجرا در پروژه اصلی Supabase (Persia Flow Hub) — SQL Editor یا supabase db push
-- ایمن: فقط additive. هیچ DROP / DELETE / تغییر ستون موجودی ندارد.
-- Idempotent: قابل اجرای چندباره.
-- پیش‌نیاز موجود در پروژه اصلی: public.is_admin(), public.profiles,
--   public.exams, public.organizations, public.categories
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.notification_channel as enum ('email', 'in_app', 'sms');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_event_type as enum (
    'exam_created','exam_updated','registration_opened','registration_extended',
    'registration_deadline_changed','registration_deadline_3_days',
    'registration_deadline_24_hours','registration_closed','exam_date_changed',
    'exam_card_published','exam_results_published','news_published','campaign'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.job_status as enum ('pending','processing','sent','failed','skipped','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.campaign_status as enum ('draft','scheduled','sending','sent','cancelled','failed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 1. تقویم آزمون (جدول کنار exams — خود exams دست‌نخورده می‌ماند)
-- ---------------------------------------------------------------------
create table if not exists public.exam_schedule (
  exam_id uuid primary key references public.exams(id) on delete cascade,
  registration_start timestamptz,
  registration_end timestamptz,
  exam_date timestamptz,
  card_published_at timestamptz,
  results_published_at timestamptz,
  source_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_exam_schedule_reg_end on public.exam_schedule (registration_end);
create index if not exists idx_exam_schedule_exam_date on public.exam_schedule (exam_date);

grant select on public.exam_schedule to anon;
grant select, insert, update, delete on public.exam_schedule to authenticated;
grant all on public.exam_schedule to service_role;
alter table public.exam_schedule enable row level security;

do $$ begin
  create policy "exam_schedule public read" on public.exam_schedule for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "exam_schedule admin write" on public.exam_schedule
    for all to authenticated using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. اخبار
-- ---------------------------------------------------------------------
create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  summary text,
  body text,
  cover_url text,
  category_id uuid references public.categories(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  exam_id uuid references public.exams(id) on delete set null,
  status text not null default 'draft',
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_news_published on public.news (published_at desc);
create index if not exists idx_news_status on public.news (status);
create index if not exists idx_news_org on public.news (organization_id);

grant select on public.news to anon;
grant select, insert, update, delete on public.news to authenticated;
grant all on public.news to service_role;
alter table public.news enable row level security;

do $$ begin
  create policy "news public read published" on public.news
    for select using (status = 'published' or public.is_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "news admin write" on public.news
    for all to authenticated using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 3. دنبال‌کردن آزمون و دستگاه (فقط رابطه — بدون تکرار داده)
-- ---------------------------------------------------------------------
create table if not exists public.exam_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, exam_id)
);
create index if not exists idx_exam_follows_exam on public.exam_follows (exam_id);

grant select, insert, update, delete on public.exam_follows to authenticated;
grant all on public.exam_follows to service_role;
alter table public.exam_follows enable row level security;

do $$ begin
  create policy "exam_follows own" on public.exam_follows
    for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "exam_follows admin read" on public.exam_follows
    for select to authenticated using (public.is_admin());
exception when duplicate_object then null; end $$;

create table if not exists public.organization_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, organization_id)
);
grant select, insert, update, delete on public.organization_follows to authenticated;
grant all on public.organization_follows to service_role;
alter table public.organization_follows enable row level security;

do $$ begin
  create policy "org_follows own" on public.organization_follows
    for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 4. مشترکین خبرنامه (مهمان + کاربر ثبت‌نام‌شده، بدون رکورد تکراری)
-- ---------------------------------------------------------------------
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text,
  user_id uuid unique references public.profiles(id) on delete cascade,
  status text not null default 'pending',           -- pending | active | unsubscribed | bounced
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  source text,
  locale text not null default 'fa',
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsletter_subscribers_identity_ck check (email is not null or user_id is not null)
);
create unique index if not exists uq_newsletter_subscribers_email
  on public.newsletter_subscribers (lower(email)) where email is not null;

grant select, insert, update on public.newsletter_subscribers to authenticated;
grant all on public.newsletter_subscribers to service_role;
alter table public.newsletter_subscribers enable row level security;

do $$ begin
  create policy "subscribers own" on public.newsletter_subscribers
    for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "subscribers admin" on public.newsletter_subscribers
    for all to authenticated using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;
-- عضویت مهمان: فقط INSERT برای anon مجاز است (بدون SELECT/UPDATE).
-- ردیف مهمان همیشه pending و بدون user_id ثبت می‌شود؛ فعال‌سازی با تأیید ایمیل.
grant insert on public.newsletter_subscribers to anon;
do $$ begin
  create policy "subscribers guest insert" on public.newsletter_subscribers
    for insert to anon
    with check (
      email is not null
      and user_id is null
      and status = 'pending'
      and confirmed_at is null
      and unsubscribed_at is null
    );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 5. تنظیمات اعلان کاربر
-- ---------------------------------------------------------------------
create table if not exists public.newsletter_preferences (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null unique references public.newsletter_subscribers(id) on delete cascade,
  newsletter boolean not null default true,
  exam_alerts boolean not null default true,
  deadline_alerts boolean not null default true,
  results_alerts boolean not null default true,
  exam_card_alerts boolean not null default true,
  news_alerts boolean not null default true,
  organization_alerts boolean not null default true,
  channel_email boolean not null default true,
  channel_in_app boolean not null default true,
  digest_frequency text not null default 'instant',  -- instant | daily | weekly
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.newsletter_preferences to authenticated;
grant all on public.newsletter_preferences to service_role;
alter table public.newsletter_preferences enable row level security;

do $$ begin
  create policy "preferences own" on public.newsletter_preferences
    for all to authenticated using (
      exists (select 1 from public.newsletter_subscribers s
              where s.id = subscriber_id and s.user_id = auth.uid())
    ) with check (
      exists (select 1 from public.newsletter_subscribers s
              where s.id = subscriber_id and s.user_id = auth.uid())
    );
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "preferences admin read" on public.newsletter_preferences
    for select to authenticated using (public.is_admin());
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 6. موتور اعلان
-- ---------------------------------------------------------------------
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type public.notification_event_type not null,
  exam_id uuid references public.exams(id) on delete cascade,
  news_id uuid references public.news(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text unique,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notification_events_unprocessed
  on public.notification_events (created_at) where processed_at is null;

create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_type public.notification_event_type not null,
  channel public.notification_channel not null default 'email',
  template_key text,
  audience text not null default 'exam_followers', -- exam_followers | org_followers | all_subscribers
  offset_hours integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.notification_events(id) on delete cascade,
  rule_id uuid references public.notification_rules(id) on delete set null,
  campaign_id uuid,
  subscriber_id uuid references public.newsletter_subscribers(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  channel public.notification_channel not null default 'email',
  template_key text,
  payload jsonb not null default '{}'::jsonb,
  status public.job_status not null default 'pending',
  scheduled_for timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_notification_jobs_due
  on public.notification_jobs (scheduled_for) where status = 'pending';

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.notification_jobs(id) on delete cascade,
  provider text not null default 'resend',
  provider_message_id text,
  recipient text not null,
  status text not null default 'queued', -- queued|sent|delivered|opened|clicked|bounced|complained|failed
  error text,
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_deliveries_provider_msg on public.notification_deliveries (provider_message_id);

create table if not exists public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  url text,
  event_type public.notification_event_type,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_in_app_unread on public.in_app_notifications (user_id, created_at desc);

grant select on public.notification_rules to authenticated;
grant select, update on public.in_app_notifications to authenticated;
grant all on public.notification_events, public.notification_rules,
  public.notification_jobs, public.notification_deliveries,
  public.in_app_notifications to service_role;

alter table public.notification_events enable row level security;
alter table public.notification_rules enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.in_app_notifications enable row level security;

do $$ begin
  create policy "in_app own" on public.in_app_notifications
    for select to authenticated using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "in_app own update" on public.in_app_notifications
    for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "notification_rules admin" on public.notification_rules
    for all to authenticated using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "notification_events admin" on public.notification_events
    for select to authenticated using (public.is_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "notification_jobs admin" on public.notification_jobs
    for select to authenticated using (public.is_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "notification_deliveries admin" on public.notification_deliveries
    for select to authenticated using (public.is_admin());
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 7. قالب‌ها، کمپین‌ها و اتوماسیون
-- ---------------------------------------------------------------------
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  subject text not null,
  html_body text not null,
  text_body text,
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  template_id uuid references public.email_templates(id) on delete set null,
  html_body text,
  audience jsonb not null default '{"type":"all_subscribers"}'::jsonb,
  status public.campaign_status not null default 'draft',
  scheduled_for timestamptz,
  sent_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  subscriber_id uuid references public.newsletter_subscribers(id) on delete cascade,
  email text not null,
  status public.job_status not null default 'pending',
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  unique (campaign_id, email)
);

create table if not exists public.email_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'resend',
  event_type text not null,
  provider_message_id text,
  recipient text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);
create index if not exists idx_provider_events_msg on public.email_provider_events (provider_message_id);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_type text not null,        -- deadline_before | exam_date_before | on_event
  event_type public.notification_event_type,
  offset_hours integer,
  audience text not null default 'exam_followers',
  template_key text,
  channel public.notification_channel not null default 'email',
  is_active boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant all on public.email_templates, public.email_campaigns,
  public.email_campaign_recipients, public.email_provider_events,
  public.automation_rules to service_role;
grant select, insert, update, delete on public.email_templates,
  public.email_campaigns, public.automation_rules to authenticated;
grant select on public.email_campaign_recipients to authenticated;

alter table public.email_templates enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_campaign_recipients enable row level security;
alter table public.email_provider_events enable row level security;
alter table public.automation_rules enable row level security;

do $$ begin
  create policy "templates admin" on public.email_templates
    for all to authenticated using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "campaigns admin" on public.email_campaigns
    for all to authenticated using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "campaign_recipients admin" on public.email_campaign_recipients
    for select to authenticated using (public.is_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "provider_events admin" on public.email_provider_events
    for select to authenticated using (public.is_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "automation admin" on public.automation_rules
    for all to authenticated using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 8. تریگرهای updated_at
-- ---------------------------------------------------------------------
create or replace function public.newsletter_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'exam_schedule','news','newsletter_subscribers','newsletter_preferences',
    'notification_rules','notification_jobs','email_templates','email_campaigns',
    'automation_rules'
  ] loop
    if not exists (select 1 from pg_trigger where tgname = format('trg_%s_updated_at', t)) then
      execute format(
        'create trigger trg_%1$s_updated_at before update on public.%1$I
         for each row execute function public.newsletter_set_updated_at()', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 9. اتصال مشترک مهمان به حساب کاربری هنگام ورود (بدون رکورد تکراری)
-- ---------------------------------------------------------------------
create or replace function public.link_newsletter_subscriber()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_id uuid;
begin
  if v_uid is null then return null; end if;

  select p.email into v_email from public.profiles p where p.id = v_uid;

  select id into v_id from public.newsletter_subscribers where user_id = v_uid;
  if v_id is not null then
    insert into public.newsletter_preferences (subscriber_id) values (v_id)
    on conflict (subscriber_id) do nothing;
    return v_id;
  end if;

  if v_email is not null then
    update public.newsletter_subscribers
       set user_id = v_uid, updated_at = now()
     where lower(email) = lower(v_email) and user_id is null
     returning id into v_id;
  end if;

  if v_id is null then
    insert into public.newsletter_subscribers (email, user_id, status, source, confirmed_at)
    values (v_email, v_uid, 'active', 'account', now())
    returning id into v_id;
  end if;

  insert into public.newsletter_preferences (subscriber_id) values (v_id)
  on conflict (subscriber_id) do nothing;

  return v_id;
end $$;

grant execute on function public.link_newsletter_subscriber() to authenticated;
