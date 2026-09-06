-- رفع خطای COALESCE: ستون digest_frequency از نوع text است، پس کست به text انجام می‌شود.

CREATE OR REPLACE FUNCTION public.newsletter_update_my_preferences(_prefs jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.newsletter_update_preferences(_token uuid, _prefs jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$


grant execute on function public.newsletter_update_my_preferences(jsonb) to authenticated;
grant execute on function public.newsletter_update_preferences(uuid, jsonb) to anon, authenticated;
