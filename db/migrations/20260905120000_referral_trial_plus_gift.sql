-- =============================================================================
-- دعوت‌نامه: ۷ روز اشتراک آزمایشی + ۷ روز هدیه برای دعوت‌شونده (جمعاً ۱۴ روز)
-- کاملاً افزایشی: فقط CREATE OR REPLACE روی تابع موجود redeem_referral.
-- بررسی مالکیت (ضد IDOR) از نسخه ۲۰۲۶-۰۹-۰۵ حفظ شده است.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.redeem_referral(p_code text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_code text;
  v_referrer uuid;
  v_referrer_name text;
  v_sub_id uuid;
  v_new_expires timestamptz;
  v_role text;
  v_caller uuid;
BEGIN
  -- ۰) بررسی مالکیت: فقط سرور (service_role) می‌تواند برای کاربر دیگری اجرا کند
  v_role := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), '');
  IF v_role = '' THEN
    BEGIN
      v_role := COALESCE(
        (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'role',
        ''
      );
    EXCEPTION WHEN others THEN
      v_role := '';
    END;
  END IF;

  BEGIN
    v_caller := auth.uid();
  EXCEPTION WHEN others THEN
    v_caller := NULL;
  END;

  IF v_role <> 'service_role' THEN
    IF v_caller IS NULL OR p_user_id IS NULL OR p_user_id <> v_caller THEN
      RETURN jsonb_build_object('ok', false, 'message', 'دسترسی مجاز نیست.');
    END IF;
  END IF;

  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'کاربر نامعتبر است.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.referral_grants WHERE referred_user_id = p_user_id) THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'message', 'هدیه دعوت قبلاً فعال شده است.');
  END IF;

  v_code := upper(btrim(COALESCE(p_code, '')));
  SELECT p.id, p.full_name INTO v_referrer, v_referrer_name
  FROM public.profiles p
  WHERE p.referral_code = v_code
  LIMIT 1;

  IF v_referrer IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'کد دعوت معتبر نیست.');
  END IF;

  IF v_referrer = p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'message', 'نمی‌توانید دعوت‌نامه خودتان را استفاده کنید.');
  END IF;

  UPDATE public.profiles
  SET referred_by = v_referrer
  WHERE id = p_user_id AND referred_by IS NULL;

  -- ۱) ۷ روز دوره آزمایشی برای دعوت‌شونده (روی پروفایل)
  UPDATE public.profiles
  SET trial_ends_at = GREATEST(COALESCE(trial_ends_at, now()), now()) + interval '7 days'
  WHERE id = p_user_id;

  -- ۲) ۷ روز اشتراک هدیه برای دعوت‌شونده (در ادامه دوره آزمایشی، جمعاً ۱۴ روز)
  SELECT s.id,
         GREATEST(COALESCE(s.expires_at, now()), now() + interval '7 days') + interval '7 days'
  INTO v_sub_id, v_new_expires
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id AND s.status = 'active'
  ORDER BY s.expires_at DESC NULLS LAST, s.created_at DESC
  LIMIT 1;

  IF v_sub_id IS NULL THEN
    INSERT INTO public.subscriptions (user_id, status, expires_at, created_by)
    VALUES (p_user_id, 'active', now() + interval '14 days', v_referrer);
  ELSE
    UPDATE public.subscriptions SET expires_at = v_new_expires WHERE id = v_sub_id;
  END IF;

  -- ۳) هدیه ۷ روز برای دعوت‌کننده (بدون تغییر)
  v_sub_id := NULL;
  SELECT s.id, GREATEST(COALESCE(s.expires_at, now()), now()) + interval '7 days'
  INTO v_sub_id, v_new_expires
  FROM public.subscriptions s
  WHERE s.user_id = v_referrer AND s.status = 'active'
  ORDER BY s.expires_at DESC NULLS LAST, s.created_at DESC
  LIMIT 1;

  IF v_sub_id IS NULL THEN
    INSERT INTO public.subscriptions (user_id, status, expires_at, created_by)
    VALUES (v_referrer, 'active', now() + interval '7 days', p_user_id);
  ELSE
    UPDATE public.subscriptions SET expires_at = v_new_expires WHERE id = v_sub_id;
  END IF;

  INSERT INTO public.referral_grants (
    referrer_id, referred_user_id, reward_days, status, referrer_rewarded_at, referred_rewarded_at
  ) VALUES (v_referrer, p_user_id, 7, 'rewarded', now(), now());

  IF EXISTS (
    SELECT 1 FROM pg_proc pr
    JOIN pg_namespace n ON n.oid = pr.pronamespace
    WHERE n.nspname = 'public' AND pr.proname = 'log_audit'
  ) THEN
    BEGIN
      PERFORM public.log_audit(
        'profiles',
        p_user_id,
        'referral_redeemed',
        jsonb_build_object('referrer_id', v_referrer, 'trial_days', 7, 'gift_days', 7)
      );
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'days', 14,
    'trial_days', 7,
    'gift_days', 7,
    'referrer_name', COALESCE(v_referrer_name, 'کاربر'),
    'message', '۷ روز اشتراک آزمایشی + ۷ روز هدیه برای شما و ۷ روز هدیه برای دعوت‌کننده فعال شد.'
  );
END;
$function$;

-- سطح دسترسی بدون تغییر: فقط سرور (service_role) اجازه اجرا دارد.
REVOKE ALL ON FUNCTION public.redeem_referral(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_referral(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.redeem_referral(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_referral(text, uuid) TO service_role;
