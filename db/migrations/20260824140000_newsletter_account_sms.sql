-- =====================================================================
-- خبرنامه بر پایه حساب کاربری «همراه استخدام» + کانال پیامک
-- کاملاً additive و idempotent. هیچ DROP/DELETE روی داده‌های موجود ندارد.
-- پیش‌نیاز: supabase/migrations/20260824090000_newsletter_core.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. تأیید شماره موبایل روی پروفایل (منبع یگانه شماره)
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists mobile_verified_at timestamptz;

-- بک‌فیل: حساب‌هایی که با ورود پیامکی (OTP) ساخته شده‌اند شماره تأییدشده دارند.
update public.profiles
   set mobile_verified_at = coalesce(mobile_verified_at, created_at)
 where mobile is not null
   and mobile_verified_at is null
   and email like '%@phone.hamrah-estekhdam.local';

create index if not exists idx_profiles_mobile_verified
  on public.profiles (mobile_verified_at) where mobile is not null;

-- ---------------------------------------------------------------------
-- 2. تکمیل جدول اخبار (فیلدهای انتشار، سئو، کانال‌ها)
-- ---------------------------------------------------------------------
alter table public.news
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists is_important boolean not null default false,
  add column if not exists channels jsonb not null default
    '{"site":true,"in_app":true,"sms":false,"email":false}'::jsonb;

create index if not exists idx_news_slug on public.news (slug);
create index if not exists idx_news_category on public.news (category_id);
create index if not exists idx_news_scheduled on public.news (scheduled_at) where status = 'scheduled';

-- ---------------------------------------------------------------------
-- 3. تنظیمات اعلان: کانال پیامک + دسته‌بندی اخبار مورد علاقه
-- ---------------------------------------------------------------------
alter table public.newsletter_preferences
  add column if not exists channel_sms boolean not null default false,
  add column if not exists news_category_ids uuid[] not null default '{}'::uuid[];

-- ---------------------------------------------------------------------
-- 4. قالب‌ها: پشتیبانی از کانال پیامک در همان جدول قالب موجود
-- ---------------------------------------------------------------------
alter table public.email_templates
  add column if not exists channel public.notification_channel not null default 'email';

alter table public.email_templates
  alter column subject drop not null,
  alter column html_body drop not null;

insert into public.email_templates (key, name, subject, html_body, text_body, variables, channel)
values (
  'news_published_sms',
  'پیامک خبر استخدامی جدید',
  null,
  null,
  E'{{site_name}}\nخبر استخدامی جدید:\n{{news_title}}\nمشاهده:\n{{news_url}}',
  '["site_name","news_title","news_url","category"]'::jsonb,
  'sms'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 5. صف اعلان: ایندکس‌های اجرا و کانال
-- ---------------------------------------------------------------------
create index if not exists idx_notification_jobs_status_channel
  on public.notification_jobs (status, channel, scheduled_for);
create index if not exists idx_notification_jobs_news
  on public.notification_jobs ((payload->>'news_id'));
create index if not exists idx_deliveries_job on public.notification_deliveries (job_id);
create index if not exists idx_deliveries_status on public.notification_deliveries (status, created_at desc);

-- ---------------------------------------------------------------------
-- 6. نمای واجدین شرایط پیامک (بر پایه حساب کاربری، نه ایمیل مستقل)
-- ---------------------------------------------------------------------
create or replace view public.newsletter_audience as
select
  p.id                                    as user_id,
  p.full_name,
  p.email,
  p.mobile,
  p.status                                as account_status,
  p.mobile_verified_at,
  p.created_at,
  s.id                                    as subscriber_id,
  s.status                                as subscriber_status,
  s.source,
  s.locale,
  s.confirmed_at,
  coalesce(pr.newsletter, false)          as newsletter_enabled,
  coalesce(pr.news_alerts, false)         as news_alerts_enabled,
  coalesce(pr.channel_sms, false)         as sms_enabled,
  coalesce(pr.channel_email, false)       as email_enabled,
  coalesce(pr.channel_in_app, false)      as in_app_enabled,
  coalesce(pr.news_category_ids, '{}'::uuid[]) as news_category_ids,
  (
    p.status = 'active'
    and s.id is not null
    and s.status <> 'unsubscribed'
    and coalesce(pr.newsletter, false)
    and coalesce(pr.news_alerts, false)
    and coalesce(pr.channel_sms, false)
    and p.mobile is not null
    and p.mobile_verified_at is not null
  )                                       as sms_eligible
from public.profiles p
left join public.newsletter_subscribers s on s.user_id = p.id
left join public.newsletter_preferences pr on pr.subscriber_id = s.id;

revoke all on public.newsletter_audience from anon, authenticated;
grant select on public.newsletter_audience to service_role;

-- ---------------------------------------------------------------------
-- 7. تنظیمات کاربر واردشده (خودش، فقط خودش)
-- ---------------------------------------------------------------------
create or replace function public.newsletter_my_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
begin
  if v_uid is null then return null; end if;

  select p.full_name, p.email, p.mobile, p.status as account_status, p.mobile_verified_at,
         s.id as subscriber_id, s.status as subscriber_status,
         pr.newsletter, pr.news_alerts, pr.exam_alerts, pr.deadline_alerts,
         pr.results_alerts, pr.exam_card_alerts, pr.organization_alerts,
         pr.channel_email, pr.channel_in_app, pr.channel_sms,
         pr.digest_frequency, pr.news_category_ids
    into v_row
    from public.profiles p
    left join public.newsletter_subscribers s on s.user_id = p.id
    left join public.newsletter_preferences pr on pr.subscriber_id = s.id
   where p.id = v_uid;

  if v_row is null then return null; end if;

  return jsonb_build_object(
    'full_name', v_row.full_name,
    'email', v_row.email,
    'mobile', v_row.mobile,
    'mobile_verified', v_row.mobile_verified_at is not null,
    'account_status', v_row.account_status,
    'subscriber_id', v_row.subscriber_id,
    'subscriber_status', coalesce(v_row.subscriber_status, 'none'),
    'preferences', jsonb_build_object(
      'newsletter', coalesce(v_row.newsletter, false),
      'news_alerts', coalesce(v_row.news_alerts, false),
      'exam_alerts', coalesce(v_row.exam_alerts, false),
      'deadline_alerts', coalesce(v_row.deadline_alerts, false),
      'results_alerts', coalesce(v_row.results_alerts, false),
      'exam_card_alerts', coalesce(v_row.exam_card_alerts, false),
      'organization_alerts', coalesce(v_row.organization_alerts, false),
      'channel_email', coalesce(v_row.channel_email, false),
      'channel_in_app', coalesce(v_row.channel_in_app, false),
      'channel_sms', coalesce(v_row.channel_sms, false),
      'digest_frequency', coalesce(v_row.digest_frequency::text, 'instant'),
      'news_category_ids', coalesce(to_jsonb(v_row.news_category_ids), '[]'::jsonb)
    )
  );
end $$;

grant execute on function public.newsletter_my_status() to authenticated;

/**
 * ذخیره تنظیمات دریافت اخبار برای کاربر واردشده.
 * اگر مشترک/تنظیمات وجود نداشته باشد، ساخته می‌شود (بدون ثبت‌نام مجزا).
 */
create or replace function public.newsletter_update_my_preferences(_prefs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid;
  v_cats uuid[];
begin
  if v_uid is null then
    raise exception 'ورود به حساب همراه استخدام لازم است';
  end if;

  v_sid := public.link_newsletter_subscriber();
  if v_sid is null then
    raise exception 'حساب کاربری یافت نشد';
  end if;

  if _prefs ? 'news_category_ids' then
    select coalesce(array_agg((value #>> '{}')::uuid), '{}'::uuid[])
      into v_cats
      from jsonb_array_elements(_prefs->'news_category_ids') as value;
  end if;

  update public.newsletter_preferences pr set
    newsletter          = coalesce((_prefs->>'newsletter')::boolean, pr.newsletter),
    news_alerts         = coalesce((_prefs->>'news_alerts')::boolean, pr.news_alerts),
    exam_alerts         = coalesce((_prefs->>'exam_alerts')::boolean, pr.exam_alerts),
    deadline_alerts     = coalesce((_prefs->>'deadline_alerts')::boolean, pr.deadline_alerts),
    results_alerts      = coalesce((_prefs->>'results_alerts')::boolean, pr.results_alerts),
    exam_card_alerts    = coalesce((_prefs->>'exam_card_alerts')::boolean, pr.exam_card_alerts),
    organization_alerts = coalesce((_prefs->>'organization_alerts')::boolean, pr.organization_alerts),
    channel_email       = coalesce((_prefs->>'channel_email')::boolean, pr.channel_email),
    channel_in_app      = coalesce((_prefs->>'channel_in_app')::boolean, pr.channel_in_app),
    channel_sms         = coalesce((_prefs->>'channel_sms')::boolean, pr.channel_sms),
    digest_frequency    = coalesce((_prefs->>'digest_frequency')::text, pr.digest_frequency),
    news_category_ids   = coalesce(v_cats, pr.news_category_ids)
  where pr.subscriber_id = v_sid;

  -- خاموش کردن کامل خبرنامه = لغو اشتراک؛ روشن کردن = فعال‌سازی مجدد
  update public.newsletter_subscribers s
     set status = case when coalesce((_prefs->>'newsletter')::boolean, true)
                       then case when s.status = 'unsubscribed' then 'active' else s.status end
                       else 'unsubscribed' end,
         unsubscribed_at = case when coalesce((_prefs->>'newsletter')::boolean, true)
                                then null else now() end,
         confirmed_at = coalesce(s.confirmed_at, now())
   where s.id = v_sid;

  return public.newsletter_my_status();
end $$;

grant execute on function public.newsletter_update_my_preferences(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 8. سازگاری با لینک‌های توکنی قدیمی خبرنامه
-- ---------------------------------------------------------------------
create or replace function public.newsletter_get_by_token(_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_row record;
begin
  select s.email, s.status,
         to_jsonb(pr) - 'id' - 'subscriber_id' - 'created_at' - 'updated_at' as prefs
    into v_row
    from public.newsletter_subscribers s
    left join public.newsletter_preferences pr on pr.subscriber_id = s.id
   where s.unsubscribe_token = _token;
  if v_row is null then return null; end if;
  return jsonb_build_object('email', v_row.email, 'status', v_row.status,
                            'preferences', coalesce(v_row.prefs, '{}'::jsonb));
end $$;

create or replace function public.newsletter_confirm(_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  update public.newsletter_subscribers
     set status = 'active', confirmed_at = coalesce(confirmed_at, now()), unsubscribed_at = null
   where unsubscribe_token = _token
   returning id into v_id;
  if v_id is null then return false; end if;
  insert into public.newsletter_preferences (subscriber_id) values (v_id)
    on conflict (subscriber_id) do nothing;
  return true;
end $$;

create or replace function public.newsletter_unsubscribe(_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  update public.newsletter_subscribers
     set status = 'unsubscribed', unsubscribed_at = now()
   where unsubscribe_token = _token
   returning id into v_id;
  return v_id is not null;
end $$;

create or replace function public.newsletter_update_preferences(_token uuid, _prefs jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id from public.newsletter_subscribers where unsubscribe_token = _token;
  if v_id is null then return false; end if;

  insert into public.newsletter_preferences (subscriber_id) values (v_id)
    on conflict (subscriber_id) do nothing;

  update public.newsletter_preferences pr set
    newsletter          = coalesce((_prefs->>'newsletter')::boolean, pr.newsletter),
    news_alerts         = coalesce((_prefs->>'news_alerts')::boolean, pr.news_alerts),
    exam_alerts         = coalesce((_prefs->>'exam_alerts')::boolean, pr.exam_alerts),
    deadline_alerts     = coalesce((_prefs->>'deadline_alerts')::boolean, pr.deadline_alerts),
    results_alerts      = coalesce((_prefs->>'results_alerts')::boolean, pr.results_alerts),
    exam_card_alerts    = coalesce((_prefs->>'exam_card_alerts')::boolean, pr.exam_card_alerts),
    organization_alerts = coalesce((_prefs->>'organization_alerts')::boolean, pr.organization_alerts),
    channel_email       = coalesce((_prefs->>'channel_email')::boolean, pr.channel_email),
    channel_in_app      = coalesce((_prefs->>'channel_in_app')::boolean, pr.channel_in_app),
    channel_sms         = coalesce((_prefs->>'channel_sms')::boolean, pr.channel_sms),
    digest_frequency    = coalesce((_prefs->>'digest_frequency')::text, pr.digest_frequency)
  where pr.subscriber_id = v_id;
  return true;
end $$;

grant execute on function public.newsletter_get_by_token(uuid) to anon, authenticated;
grant execute on function public.newsletter_confirm(uuid) to anon, authenticated;
grant execute on function public.newsletter_unsubscribe(uuid) to anon, authenticated;
grant execute on function public.newsletter_update_preferences(uuid, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. آمار مخاطبان پیامک (فقط مدیر)
-- ---------------------------------------------------------------------
create or replace function public.newsletter_sms_audience_stats(_category_ids uuid[] default '{}'::uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if not public.is_admin() then
    raise exception 'دسترسی مدیر لازم است';
  end if;

  select jsonb_build_object(
    'total_users',        count(*),
    'active_accounts',    count(*) filter (where account_status = 'active'),
    'newsletter_on',      count(*) filter (where newsletter_enabled),
    'newsletter_off',     count(*) filter (where not newsletter_enabled),
    'sms_on',             count(*) filter (where sms_enabled),
    'sms_off',            count(*) filter (where not sms_enabled),
    'no_mobile',          count(*) filter (where mobile is null),
    'unverified_mobile',  count(*) filter (where mobile is not null and mobile_verified_at is null),
    'eligible',           count(*) filter (
                            where sms_eligible
                              and (
                                coalesce(array_length(_category_ids, 1), 0) = 0
                                or coalesce(array_length(news_category_ids, 1), 0) = 0
                                or news_category_ids && _category_ids
                              )
                          )
  ) into v
  from public.newsletter_audience;

  return v;
end $$;

grant execute on function public.newsletter_sms_audience_stats(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 10. ثبت رویداد انتشار خبر و ساخت کارهای صف (idempotent)
-- ---------------------------------------------------------------------
create or replace function public.newsletter_enqueue_news(
  _news_id uuid,
  _channels public.notification_channel[] default array['sms']::public.notification_channel[],
  _audience text default 'all_newsletter',
  _category_ids uuid[] default '{}'::uuid[],
  _template_key text default 'news_published_sms',
  _only_user_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_news record;
  v_event_id uuid;
  v_channel public.notification_channel;
  v_channels integer := 0;
  v_total integer := 0;
begin
  if not public.is_admin() then
    raise exception 'دسترسی مدیر لازم است';
  end if;

  select n.id, n.title, n.slug, n.summary, n.category_id, c.name as category_name
    into v_news
    from public.news n
    left join public.categories c on c.id = n.category_id
   where n.id = _news_id;

  if v_news is null then
    raise exception 'خبر یافت نشد';
  end if;

  -- یک رویداد به ازای هر خبر (کلید یکتا = محافظت از ارسال تکراری)
  insert into public.notification_events (event_type, news_id, payload, dedupe_key)
  values ('news_published', _news_id,
          jsonb_build_object('title', v_news.title, 'slug', v_news.slug,
                             'category', v_news.category_name),
          'news_published:' || _news_id::text)
  on conflict (dedupe_key) do update set payload = excluded.payload
  returning id into v_event_id;

  foreach v_channel in array _channels loop
    insert into public.notification_jobs
      (event_id, subscriber_id, user_id, channel, template_key, payload, status, dedupe_key)
    select
      v_event_id,
      a.subscriber_id,
      a.user_id,
      v_channel,
      _template_key,
      jsonb_build_object(
        'news_id', v_news.id,
        'news_title', v_news.title,
        'news_slug', v_news.slug,
        'news_summary', v_news.summary,
        'category', v_news.category_name
      ),
      'pending',
      'news:' || _news_id::text || ':' || a.user_id::text || ':' || v_channel::text
    from public.newsletter_audience a
    where a.subscriber_id is not null
      and a.account_status = 'active'
      and a.subscriber_status <> 'unsubscribed'
      and a.newsletter_enabled
      and a.news_alerts_enabled
      and (
        case v_channel
          when 'sms' then a.sms_eligible
          when 'email' then a.email_enabled and a.email is not null
          else a.in_app_enabled
        end
      )
      and (_only_user_ids is null or a.user_id = any(_only_user_ids))
      and (_audience <> 'sms_enabled_only' or a.sms_enabled)
      and (
        coalesce(array_length(_category_ids, 1), 0) = 0
        or coalesce(array_length(a.news_category_ids, 1), 0) = 0
        or a.news_category_ids && _category_ids
      )
    on conflict (dedupe_key) do nothing;

    v_channels := v_channels + 1;
  end loop;

  select count(*) into v_total
    from public.notification_jobs
   where event_id = v_event_id and status = 'pending';

  update public.notification_events set processed_at = now() where id = v_event_id;

  return jsonb_build_object('event_id', v_event_id, 'channels', v_channels, 'pending_jobs', v_total);
end $$;

grant execute on function public.newsletter_enqueue_news(
  uuid, public.notification_channel[], text, uuid[], text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 11. برداشتن دسته‌ای کارها از صف + اعتبارسنجی مجدد تنظیمات
-- ---------------------------------------------------------------------
create or replace function public.newsletter_claim_jobs(
  _channel public.notification_channel default 'sms',
  _limit integer default 50
)
returns table (
  job_id uuid,
  claim_user_id uuid,
  claim_channel public.notification_channel,
  template_key text,
  payload jsonb,
  mobile text,
  email text,
  attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select j.id
      from public.notification_jobs j
     where j.status = 'pending'
       and j.channel = _channel
       and j.scheduled_for <= now()
       and j.attempts < 3
     order by j.scheduled_for
     limit greatest(1, least(_limit, 200))
     for update skip locked
  ),
  invalid as (
    update public.notification_jobs j
       set status = 'skipped',
           last_error = 'تنظیمات کاربر اجازه ارسال نمی‌دهد',
           updated_at = now()
     where j.id in (select id from claimed)
       and not exists (
         select 1 from public.newsletter_audience a
          where a.user_id = j.user_id
            and a.account_status = 'active'
            and a.subscriber_status <> 'unsubscribed'
            and a.newsletter_enabled
            and a.news_alerts_enabled
            and case j.channel
                  when 'sms' then a.sms_eligible
                  when 'email' then a.email_enabled and a.email is not null
                  else a.in_app_enabled
                end
       )
     returning j.id
  ),
  taken as (
    update public.notification_jobs j
       set status = 'processing', attempts = j.attempts + 1, updated_at = now()
     where j.id in (select id from claimed)
       and j.id not in (select id from invalid)
     returning j.id, j.user_id, j.channel, j.template_key, j.payload, j.attempts
  )
  select t.id, t.user_id, t.channel, t.template_key, t.payload,
         p.mobile, p.email, t.attempts
    from taken t
    join public.profiles p on p.id = t.user_id;
end $$;

revoke all on function public.newsletter_claim_jobs(public.notification_channel, integer)
  from anon, authenticated;
grant execute on function public.newsletter_claim_jobs(public.notification_channel, integer)
  to service_role;

-- ---------------------------------------------------------------------
-- 12. ثبت نتیجه ارسال (delivery tracking + backoff)
-- ---------------------------------------------------------------------
create or replace function public.newsletter_complete_job(
  _job_id uuid,
  _status public.job_status,
  _provider text,
  _provider_message_id text default null,
  _recipient text default null,
  _error text default null,
  _delivery_status text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notification_jobs
     set status = case
                    when _status = 'failed' and attempts < 3 then 'pending'
                    else _status
                  end,
         scheduled_for = case
                    when _status = 'failed' and attempts < 3
                    then now() + (interval '2 minutes' * power(2, attempts))
                    else scheduled_for
                  end,
         last_error = _error,
         updated_at = now()
   where id = _job_id;

  insert into public.notification_deliveries
    (job_id, provider, provider_message_id, recipient, status, error, sent_at)
  values (
    _job_id, _provider, _provider_message_id, coalesce(_recipient, '-'),
    coalesce(_delivery_status,
      case _status when 'sent' then 'sent' when 'skipped' then 'cancelled' else 'failed' end),
    _error,
    case when _status = 'sent' then now() else null end
  );
end $$;

revoke all on function public.newsletter_complete_job(uuid, public.job_status, text, text, text, text, text)
  from anon, authenticated;
grant execute on function public.newsletter_complete_job(uuid, public.job_status, text, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------
-- 13. آمار داشبورد خبرنامه (فقط مدیر)
-- ---------------------------------------------------------------------
create or replace function public.newsletter_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_audience jsonb;
  v_news jsonb;
  v_delivery jsonb;
begin
  if not public.is_admin() then
    raise exception 'دسترسی مدیر لازم است';
  end if;

  select jsonb_build_object(
    'total_users', count(*),
    'active_accounts', count(*) filter (where account_status = 'active'),
    'newsletter_on', count(*) filter (where newsletter_enabled),
    'sms_on', count(*) filter (where sms_enabled),
    'sms_off', count(*) filter (where not sms_enabled),
    'sms_eligible', count(*) filter (where sms_eligible)
  ) into v_audience from public.newsletter_audience;

  select jsonb_build_object(
    'total', count(*),
    'published', count(*) filter (where status = 'published'),
    'draft', count(*) filter (where status = 'draft'),
    'scheduled', count(*) filter (where status = 'scheduled'),
    'last_7_days', count(*) filter (where published_at > now() - interval '7 days')
  ) into v_news from public.news;

  select jsonb_build_object(
    'sms_sent', count(*) filter (where status in ('sent','delivered')),
    'sms_delivered', count(*) filter (where status = 'delivered'),
    'sms_failed', count(*) filter (where status = 'failed'),
    'total', count(*),
    'queued_jobs', (select count(*) from public.notification_jobs where status = 'pending'),
    'failed_jobs', (select count(*) from public.notification_jobs where status = 'failed')
  ) into v_delivery from public.notification_deliveries;

  return jsonb_build_object('audience', v_audience, 'news', v_news, 'delivery', v_delivery,
                            'campaigns', (select count(*) from public.email_campaigns));
end $$;

grant execute on function public.newsletter_admin_overview() to authenticated;
