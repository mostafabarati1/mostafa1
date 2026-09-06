GRANT SELECT, INSERT, UPDATE ON public.sms_settings TO authenticated;
GRANT ALL ON public.sms_settings TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.sms_delivery_logs TO authenticated;
GRANT ALL ON public.sms_delivery_logs TO service_role;

ALTER TABLE public.sms_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_settings_admin_all ON public.sms_settings;
CREATE POLICY sms_settings_admin_all
  ON public.sms_settings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS sms_delivery_logs_admin_all ON public.sms_delivery_logs;
CREATE POLICY sms_delivery_logs_admin_all
  ON public.sms_delivery_logs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT EXECUTE ON FUNCTION public.can_view_exam(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_attempt(uuid, uuid[]) TO authenticated;

INSERT INTO public.profiles (id, full_name, email)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1), 'کاربر'), u.email
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'candidate'::public.app_role
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.start_attempt(p_exam_id uuid, p_category_ids uuid[] DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); e public.exams; v_id uuid; v_used int;
        v_cats uuid[] := CASE WHEN p_category_ids IS NULL OR array_length(p_category_ids,1) IS NULL
                              THEN NULL ELSE p_category_ids END;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  INSERT INTO public.profiles (id, full_name, email)
  SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1), 'کاربر'), u.email
  FROM auth.users u WHERE u.id = v_uid
  ON CONFLICT (id) DO NOTHING;

  IF NOT public.can_view_exam(p_exam_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO e FROM public.exams WHERE id = p_exam_id;
  IF e.id IS NULL THEN RAISE EXCEPTION 'exam not found'; END IF;

  SELECT id INTO v_id FROM public.exam_attempts
   WHERE exam_id = p_exam_id AND candidate_id = v_uid AND status = 'in_progress'
     AND (expires_at IS NULL OR expires_at > now()) LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT count(*) INTO v_used FROM public.exam_attempts
   WHERE exam_id = p_exam_id AND candidate_id = v_uid AND status <> 'in_progress';
  IF e.max_attempts IS NOT NULL AND v_used >= e.max_attempts THEN
    RAISE EXCEPTION 'max attempts reached';
  END IF;
  IF NOT e.is_free AND NOT public.has_active_subscription(v_uid) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'subscription required';
  END IF;

  INSERT INTO public.exam_attempts(exam_id, candidate_id, category_ids, started_at, expires_at, status)
  VALUES (p_exam_id, v_uid, v_cats, now(),
          now() + make_interval(mins => COALESCE(e.duration_minutes,60)), 'in_progress')
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.start_attempt(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_attempt(uuid, uuid[]) TO authenticated, service_role;