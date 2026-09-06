-- =====================================================================
-- ثبت ایمیل واقعی کاربر (ورود با موبایل) برای دریافت اخبار و خبرنامه
-- additive و idempotent
-- =====================================================================

create or replace function public.newsletter_set_my_email(_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(_email, '')));
  v_sid uuid;
begin
  if v_uid is null then
    raise exception 'ورود به حساب همراه استخدام لازم است';
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'ایمیل وارد‌شده معتبر نیست';
  end if;

  if v_email like '%@phone.hamrah-estekhdam.local' then
    raise exception 'لطفاً یک ایمیل واقعی وارد کنید';
  end if;

  if exists (select 1 from public.profiles p where lower(p.email) = v_email and p.id <> v_uid) then
    raise exception 'این ایمیل قبلاً برای حساب دیگری ثبت شده است';
  end if;

  if exists (
    select 1 from public.newsletter_subscribers s
     where lower(s.email) = v_email
       and coalesce(s.user_id, v_uid) <> v_uid
  ) then
    raise exception 'این ایمیل قبلاً برای حساب دیگری ثبت شده است';
  end if;

  update public.profiles set email = v_email where id = v_uid;

  v_sid := public.link_newsletter_subscriber();
  if v_sid is not null then
    update public.newsletter_subscribers set email = v_email where id = v_sid;
  end if;

  return public.newsletter_my_status();
end $$;

grant execute on function public.newsletter_set_my_email(text) to authenticated;
