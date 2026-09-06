-- Additive: allow the "suspended" account status already used by the admin UI.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('active','inactive','banned','suspended'));

-- Secure role change: admin only, no self-demotion, never remove the last admin.
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_user_id uuid, p_role app_role, p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_before app_role; v_admins int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE='P0002';
  END IF;
  IF p_user_id = auth.uid() AND p_role <> 'admin' THEN
    RAISE EXCEPTION 'cannot_demote_self' USING ERRCODE='42501';
  END IF;

  SELECT role INTO v_before FROM public.user_roles WHERE user_id = p_user_id
    ORDER BY (role = 'admin') DESC LIMIT 1;

  IF v_before = 'admin' AND p_role <> 'admin' THEN
    SELECT count(*) INTO v_admins FROM public.user_roles WHERE role = 'admin';
    IF v_admins <= 1 THEN RAISE EXCEPTION 'last_admin' USING ERRCODE='42501'; END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  INSERT INTO public.user_roles(user_id, role) VALUES (p_user_id, p_role) ON CONFLICT DO NOTHING;

  PERFORM public.log_audit('user_roles', p_user_id, 'set_role', jsonb_build_object(
    'user_id', p_user_id::text, 'before', v_before, 'after', p_role, 'reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'role', p_role);
END $fn$;

-- Secure account status change: admin only, no self lock-out, audited.
CREATE OR REPLACE FUNCTION public.admin_set_user_status(
  p_user_id uuid, p_status text, p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_before text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('active','inactive','banned','suspended') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE='22023';
  END IF;
  IF p_user_id = auth.uid() AND p_status <> 'active' THEN
    RAISE EXCEPTION 'cannot_suspend_self' USING ERRCODE='42501';
  END IF;

  SELECT status INTO v_before FROM public.profiles WHERE id = p_user_id;
  IF v_before IS NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE='P0002';
  END IF;

  UPDATE public.profiles SET status = p_status, updated_at = now() WHERE id = p_user_id;

  PERFORM public.log_audit('profiles', p_user_id, 'set_status', jsonb_build_object(
    'user_id', p_user_id::text, 'before', v_before, 'after', p_status, 'reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'status', p_status);
END $fn$;

-- Secure subscription cancellation: reason is mandatory, audited.
CREATE OR REPLACE FUNCTION public.admin_cancel_subscription(
  p_user_id uuid, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_count int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE='22023';
  END IF;

  UPDATE public.subscriptions SET status = 'cancelled', updated_at = now()
   WHERE user_id = p_user_id AND status <> 'cancelled';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.log_audit('subscriptions', p_user_id, 'cancel', jsonb_build_object(
    'user_id', p_user_id::text, 'affected', v_count, 'reason', btrim(p_reason)));
  RETURN jsonb_build_object('ok', true, 'affected', v_count);
END $fn$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, app_role, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_cancel_subscription(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, app_role, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_subscription(uuid, text) TO authenticated;

-- Additive: enrich the user detail payload (existing keys unchanged).
CREATE OR REPLACE FUNCTION public.admin_get_user_detail(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id, 'full_name', p.full_name, 'email', p.email, 'mobile', p.mobile,
      'avatar_url', p.avatar_url, 'status', p.status, 'has_used_trial', p.has_used_trial,
      'trial_started_at', p.trial_started_at, 'trial_ends_at', p.trial_ends_at,
      'created_at', p.created_at, 'updated_at', p.updated_at,
      'role', (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = p.id ORDER BY (ur.role = 'admin') DESC LIMIT 1)
    ),
    'summary', jsonb_build_object(
      'attempts_count', (SELECT count(*) FROM public.exam_attempts WHERE candidate_id = p.id),
      'payments_count', (SELECT count(*) FROM public.payments WHERE user_id = p.id),
      'paid_total', COALESCE((SELECT sum(amount) FROM public.payments WHERE user_id = p.id AND status IN ('paid','verified')), 0),
      'reports_count', (SELECT count(*) FROM public.question_reports WHERE reporter_id = p.id),
      'subscriptions_count', (SELECT count(*) FROM public.subscriptions WHERE user_id = p.id),
      'active_subscription', (SELECT jsonb_build_object('id', s.id, 'status', s.status, 'plan_title', pl.title,
            'started_at', s.started_at, 'expires_at', s.expires_at)
          FROM public.subscriptions s LEFT JOIN public.plans pl ON pl.id = s.plan_id
          WHERE s.user_id = p.id AND s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > now())
          ORDER BY s.expires_at DESC NULLS LAST LIMIT 1),
      'last_activity_at', GREATEST(
          COALESCE((SELECT max(created_at) FROM public.exam_attempts WHERE candidate_id = p.id), p.created_at),
          COALESCE((SELECT max(created_at) FROM public.payments WHERE user_id = p.id), p.created_at),
          COALESCE(p.updated_at, p.created_at))
    ),
    'subscriptions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'status', s.status, 'plan_id', s.plan_id, 'plan_title', pl.title,
        'started_at', s.started_at, 'expires_at', s.expires_at, 'created_at', s.created_at,
        'updated_at', s.updated_at
      ) ORDER BY s.created_at DESC)
      FROM public.subscriptions s LEFT JOIN public.plans pl ON pl.id = s.plan_id
      WHERE s.user_id = p.id), '[]'::jsonb),
    'grants', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'days', g.days, 'expires_at', g.expires_at, 'reason', g.reason,
        'created_at', g.created_at, 'admin_name', ap.full_name
      ) ORDER BY g.created_at DESC)
      FROM public.admin_subscription_grants g LEFT JOIN public.profiles ap ON ap.id = g.admin_id
      WHERE g.user_id = p.id), '[]'::jsonb),
    'attempts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'exam_id', a.exam_id, 'exam_title', e.title, 'status', a.status,
        'earned_score', a.earned_score, 'total_score', a.total_score, 'passed', a.passed,
        'started_at', a.started_at, 'submitted_at', a.submitted_at,
        'correct_count', a.correct_count, 'incorrect_count', a.incorrect_count,
        'unanswered_count', a.unanswered_count,
        'duration_seconds', CASE WHEN a.submitted_at IS NOT NULL AND a.started_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (a.submitted_at - a.started_at))::int END
      ) ORDER BY a.created_at DESC)
      FROM (SELECT * FROM public.exam_attempts WHERE candidate_id = p.id ORDER BY created_at DESC LIMIT 25) a
      LEFT JOIN public.exams e ON e.id = a.exam_id), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', pay.id, 'amount', pay.amount, 'status', pay.status, 'gateway', pay.gateway,
        'ref_id', pay.ref_id, 'plan_title', pl2.title, 'created_at', pay.created_at,
        'paid_at', pay.paid_at, 'currency', pay.currency, 'verified_at', pay.verified_at,
        'subscription_id', pay.subscription_id
      ) ORDER BY pay.created_at DESC)
      FROM (SELECT * FROM public.payments WHERE user_id = p.id ORDER BY created_at DESC LIMIT 25) pay
      LEFT JOIN public.plans pl2 ON pl2.id = pay.plan_id), '[]'::jsonb),
    'reports', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', qr.id, 'question_id', qr.question_id, 'reason', qr.reason, 'status', qr.status,
        'description', qr.description, 'created_at', qr.created_at,
        'updated_at', qr.updated_at, 'admin_note', qr.admin_note, 'exam_id', qr.exam_id
      ) ORDER BY qr.created_at DESC)
      FROM public.question_reports qr WHERE qr.reporter_id = p.id), '[]'::jsonb),
    'audit', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', al.id, 'entity', al.entity, 'entity_id', al.entity_id, 'action', al.action,
        'actor_id', al.actor_id, 'actor_name', al.actor_name, 'details', al.details,
        'created_at', al.created_at
      ) ORDER BY al.created_at DESC)
      FROM (SELECT * FROM public.audit_logs
            WHERE entity_id = p.id OR (entity IN ('profiles','user_roles','subscriptions','payments') AND details->>'user_id' = p.id::text)
            ORDER BY created_at DESC LIMIT 50) al), '[]'::jsonb)
  ) INTO r
  FROM public.profiles p WHERE p.id = p_user_id;

  IF r IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN r;
END $function$;