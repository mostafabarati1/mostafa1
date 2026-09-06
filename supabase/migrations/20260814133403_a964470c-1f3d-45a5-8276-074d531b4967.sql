CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_days int;
BEGIN
  SELECT COALESCE((value #>> '{}')::int, 7) INTO v_days
  FROM public.app_settings WHERE key = 'trial_days';
  IF v_days IS NULL OR v_days <= 0 THEN v_days := 7; END IF;

  INSERT INTO public.profiles (id, full_name, email, has_used_trial, trial_started_at, trial_ends_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name',''),
    NEW.email,
    true,
    now(),
    now() + make_interval(days => v_days)
  )
  ON CONFLICT (id) DO UPDATE SET
    has_used_trial = true,
    trial_started_at = COALESCE(public.profiles.trial_started_at, now()),
    trial_ends_at = COALESCE(public.profiles.trial_ends_at, now() + make_interval(days => v_days));

  IF NEW.email IS NOT NULL THEN
    INSERT INTO public.trial_claims (email, first_user_id)
    VALUES (lower(NEW.email), NEW.id)
    ON CONFLICT (email) DO NOTHING;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

UPDATE public.profiles
SET has_used_trial = true,
    trial_started_at = COALESCE(trial_started_at, now()),
    trial_ends_at = now() + interval '7 days'
WHERE trial_ends_at IS NULL AND has_used_trial = false;