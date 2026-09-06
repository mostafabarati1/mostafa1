-- دیجست هفتگی خبرنامه با هوش مصنوعی — فقط افزایشی (additive)
-- صف/رفتار خبرنامه موجود تغییری نمی‌کند؛ فقط ستون/نما/تابع و قالب جدید.

-- ---------------------------------------------------------------------
-- 1. آخرین زمان ارسال دیجست هفتگی (برای idempotency)
-- ---------------------------------------------------------------------
alter table public.newsletter_preferences
  add column if not exists last_digest_sent_at timestamptz;

-- ---------------------------------------------------------------------
-- 2. قالب ایمیل دیجست هفتگی
-- ---------------------------------------------------------------------
insert into public.email_templates (key, name, subject, html_body, text_body, variables, channel)
values (
  'weekly_digest',
  'دیجست هفتگی اخبار استخدامی',
  'دیجست هفتگی همراه استخدام — {{week_label}}',
  null,
  E'{{digest_body}}',
  '["week_label","digest_body","site_name","unsubscribe_url"]'::jsonb,
  'email'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 3. نمای واجدین شرایط دریافت دیجست هفتگی
--    (مشترک فعال + newsletter=true + digest_frequency='weekly' +
--     last_digest_sent_at خالی یا قدیمی‌تر از ۷ روز)
-- ---------------------------------------------------------------------
create or replace view public.newsletter_digest_audience as
select
  s.id                                          as subscriber_id,
  s.user_id,
  s.email                                       as subscriber_email,
  s.unsubscribe_token,
  p.email                                       as profile_email,
  p.mobile,
  p.mobile_verified_at,
  coalesce(pr.channel_email, false)             as channel_email,
  coalesce(pr.channel_sms, false)               as channel_sms,
  coalesce(pr.news_category_ids, '{}'::uuid[])  as news_category_ids,
  pr.last_digest_sent_at
from public.newsletter_subscribers s
left join public.profiles p on p.id = s.user_id
left join public.newsletter_preferences pr on pr.subscriber_id = s.id
where s.status = 'active'
  and coalesce(pr.newsletter, false)
  and coalesce(pr.digest_frequency, 'instant') = 'weekly'
  and (pr.last_digest_sent_at is null or pr.last_digest_sent_at < now() - interval '7 days');

revoke all on public.newsletter_digest_audience from anon, authenticated;
grant select on public.newsletter_digest_audience to service_role;

-- ---------------------------------------------------------------------
-- 4. ثبت زمان ارسال دیجست (برای جلوگیری از ارسال تکراری در همان هفته)
-- ---------------------------------------------------------------------
create or replace function public.newsletter_mark_digest_sent(_subscriber_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.newsletter_preferences
     set last_digest_sent_at = now(),
         updated_at = now()
   where subscriber_id = _subscriber_id;
end $$;

revoke all on function public.newsletter_mark_digest_sent(uuid) from anon, authenticated;
grant execute on function public.newsletter_mark_digest_sent(uuid) to service_role;
