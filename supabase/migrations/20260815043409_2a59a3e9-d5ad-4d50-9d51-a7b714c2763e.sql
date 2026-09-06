CREATE OR REPLACE FUNCTION public.start_attempt(p_exam_id uuid, p_category_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); e public.exams; v_id uuid; v_used int; v_today int;
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

  -- daily limit: one attempt per exam per day (Tehran calendar day)
  IF NOT public.is_admin() THEN
    SELECT count(*) INTO v_today FROM public.exam_attempts
     WHERE exam_id = p_exam_id AND candidate_id = v_uid
       AND (started_at AT TIME ZONE 'Asia/Tehran')::date = (now() AT TIME ZONE 'Asia/Tehran')::date;
    IF v_today >= 1 THEN RAISE EXCEPTION 'daily attempt limit reached'; END IF;
  END IF;

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
END; $function$;