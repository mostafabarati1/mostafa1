-- =============================================================================
-- ماژول دعوت کاربر (Invite & Referral) — کاملاً افزایشی و idempotent
-- تاریخ: 2026-09-02
-- هیچ جدول/ستون/تابع موجودی حذف یا تغییر نمی‌کند.
-- =============================================================================

-- ۱) ستون‌های افزودنی جدول profiles ------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_referral_code_key'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_referral_code_key UNIQUE (referral_code);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_referred_by_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_referred_by_fkey
      FOREIGN KEY (referred_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ۲) جدول referral_grants ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward_days integer NOT NULL DEFAULT 7,
  status text NOT NULL DEFAULT 'rewarded' CHECK (status IN ('rewarded', 'revoked')),
  referrer_rewarded_at timestamptz,
  referred_rewarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_grants_referrer
  ON public.referral_grants (referrer_id);

GRANT SELECT ON public.referral_grants TO authenticated;
GRANT ALL ON public.referral_grants TO service_role;

ALTER TABLE public.referral_grants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'referral_grants'
      AND policyname = 'referral_grants_select_own'
  ) THEN
    CREATE POLICY referral_grants_select_own
      ON public.referral_grants
      FOR SELECT
      TO authenticated
      USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id);
  END IF;
END$$;

-- ۳) تولید خودکار کد دعوت -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_generate_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  IF NEW.referral_code IS NULL OR btrim(NEW.referral_code) = '' THEN
    LOOP
      v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.referral_code = v_code);
    END LOOP;
    NEW.referral_code := v_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_generate_referral_code ON public.profiles;
CREATE TRIGGER trg_profiles_generate_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_generate_referral_code();

-- ۴) Backfill کاربران موجود ------------------------------------------------------
UPDATE public.profiles
SET referral_code = upper(substr(replace(id::text, '-', ''), 1, 8))
WHERE referral_code IS NULL OR referral_code = '';

-- ۵) RPC: referral_info ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.referral_info(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_id uuid;
  v_name text;
BEGIN
  v_code := upper(btrim(COALESCE(p_code, '')));
  IF v_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'کد دعوت نامعتبر است.');
  END IF;

  SELECT p.id, p.full_name INTO v_id, v_name
  FROM public.profiles p
  WHERE p.referral_code = v_code
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'کد دعوت یافت نشد.');
  END IF;

  RETURN jsonb_build_object('ok', true, 'referrer_id', v_id, 'referrer_name', COALESCE(v_name, 'کاربر'));
END;
$$;

GRANT EXECUTE ON FUNCTION public.referral_info(text) TO anon, authenticated, service_role;

-- ۶) RPC: redeem_referral --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_referral(p_code text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_referrer uuid;
  v_referrer_name text;
  v_sub_id uuid;
  v_new_expires timestamptz;
BEGIN
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

  -- هدیه ۷ روز برای دعوت‌شونده
  SELECT s.id, GREATEST(COALESCE(s.expires_at, now()), now()) + interval '7 days'
  INTO v_sub_id, v_new_expires
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id AND s.status = 'active'
  ORDER BY s.expires_at DESC NULLS LAST, s.created_at DESC
  LIMIT 1;

  IF v_sub_id IS NULL THEN
    INSERT INTO public.subscriptions (user_id, status, expires_at, created_by)
    VALUES (p_user_id, 'active', now() + interval '7 days', v_referrer);
  ELSE
    UPDATE public.subscriptions SET expires_at = v_new_expires WHERE id = v_sub_id;
  END IF;

  -- هدیه ۷ روز برای دعوت‌کننده
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
        jsonb_build_object('referrer_id', v_referrer, 'days', 7)
      );
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'days', 7,
    'referrer_name', COALESCE(v_referrer_name, 'کاربر'),
    'message', '۷ روز اشتراک هدیه برای شما و دعوت‌کننده فعال شد.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_referral(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_referral(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.redeem_referral(text, uuid) TO authenticated, service_role;

-- ۷) محافظت افزودنی: کاربر عادی نتواند referral_code / referred_by را تغییر دهد ----
CREATE OR REPLACE FUNCTION public.profiles_protect_referral_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.referral_code := OLD.referral_code;
    NEW.referred_by := OLD.referred_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_referral_fields ON public.profiles;
CREATE TRIGGER trg_profiles_protect_referral_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_protect_referral_fields();
