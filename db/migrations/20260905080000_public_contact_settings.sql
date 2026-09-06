-- Additive: expose a whitelisted, read-only subset of app_settings publicly so the
-- landing page "ارتباط با ما" block can be edited from the admin settings page.

create or replace function public.get_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from public.app_settings
  where key in (
    'site_name',
    'support_email',
    'support_phone',
    'social_instagram',
    'social_telegram',
    'social_linkedin',
    'social_facebook',
    'social_whatsapp',
    'social_x'
  )
$$;

grant execute on function public.get_public_settings() to anon, authenticated, service_role;

-- Seed empty social keys so they appear in the admin settings editor.
insert into public.app_settings (key, value)
select k, '""'::jsonb
from (
  values
    ('social_instagram'),
    ('social_telegram'),
    ('social_linkedin'),
    ('social_facebook'),
    ('social_whatsapp'),
    ('social_x')
) as t(k)
where not exists (select 1 from public.app_settings s where s.key = t.k);
