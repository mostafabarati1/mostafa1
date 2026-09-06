CREATE OR REPLACE FUNCTION public.admin_analytics_overview(p_range integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from timestamptz;
  v_prev_from timestamptz;
  r jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  p_range := GREATEST(COALESCE(p_range, 30), 1);
  v_from := now() - (p_range || ' days')::interval;
  v_prev_from := now() - (2 * p_range || ' days')::interval;

  SELECT jsonb_build_object(
    'range_days', p_range,
    'users', jsonb_build_object(
      'total', (SELECT count(*) FROM public.profiles),
      'new', (SELECT count(*) FROM public.profiles WHERE created_at >= v_from),
      'new_prev', (SELECT count(*) FROM public.profiles WHERE created_at >= v_prev_from AND created_at < v_from),
      'active_7d', (SELECT count(DISTINCT candidate_id) FROM public.exam_attempts WHERE created_at >= now() - interval '7 days'),
      'active_7d_prev', (SELECT count(DISTINCT candidate_id) FROM public.exam_attempts WHERE created_at >= now() - interval '14 days' AND created_at < now() - interval '7 days')
    ),
    'subs', jsonb_build_object(
      'active', (SELECT count(*) FROM public.subscriptions WHERE status = 'active' AND (expires_at IS NULL OR expires_at > now())),
      'trial', (SELECT count(*) FROM public.subscriptions WHERE status = 'trial' AND (expires_at IS NULL OR expires_at > now())),
      'expired', (SELECT count(*) FROM public.subscriptions WHERE status = 'expired' OR (expires_at IS NOT NULL AND expires_at <= now())),
      'cancelled', (SELECT count(*) FROM public.subscriptions WHERE status = 'cancelled')
    ),
    'revenue', jsonb_build_object(
      'total', COALESCE((SELECT sum(amount) FROM public.payments WHERE status IN ('paid','verified') AND COALESCE(paid_at, created_at) >= v_from), 0),
      'total_prev', COALESCE((SELECT sum(amount) FROM public.payments WHERE status IN ('paid','verified') AND COALESCE(paid_at, created_at) >= v_prev_from AND COALESCE(paid_at, created_at) < v_from), 0),
      'by_day', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('day', d.day, 'amount', d.amount) ORDER BY d.day)
        FROM (
          SELECT (date_trunc('day', COALESCE(paid_at, created_at)))::date AS day, sum(amount) AS amount
          FROM public.payments
          WHERE status IN ('paid','verified') AND COALESCE(paid_at, created_at) >= v_from
          GROUP BY 1
        ) d), '[]'::jsonb)
    ),
    'exams', jsonb_build_object(
      'published', (SELECT count(*) FROM public.exams WHERE status = 'published'),
      'total', (SELECT count(*) FROM public.exams),
      'attempts_today', (SELECT count(*) FROM public.exam_attempts WHERE created_at >= date_trunc('day', now())),
      'attempts_yesterday', (SELECT count(*) FROM public.exam_attempts WHERE created_at >= date_trunc('day', now()) - interval '1 day' AND created_at < date_trunc('day', now())),
      'attempt_pass_rate', COALESCE((SELECT round(100.0 * count(*) FILTER (WHERE passed) / NULLIF(count(*), 0), 1) FROM public.exam_attempts WHERE submitted_at >= v_from), 0),
      'attempt_pass_rate_prev', COALESCE((SELECT round(100.0 * count(*) FILTER (WHERE passed) / NULLIF(count(*), 0), 1) FROM public.exam_attempts WHERE submitted_at >= v_prev_from AND submitted_at < v_from), 0),
      'attempts_by_day', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('day', d.day, 'count', d.c) ORDER BY d.day)
        FROM (
          SELECT (date_trunc('day', created_at))::date AS day, count(*) AS c
          FROM public.exam_attempts WHERE created_at >= v_from GROUP BY 1
        ) d), '[]'::jsonb)
    ),
    'payments', jsonb_build_object(
      'total', (SELECT count(*) FROM public.payments),
      'paid', (SELECT count(*) FROM public.payments WHERE status IN ('paid','verified')),
      'failed', (SELECT count(*) FROM public.payments WHERE status IN ('failed','cancelled')),
      'pending', (SELECT count(*) FROM public.payments WHERE status IN ('pending','processing'))
    ),
    'question_reports', jsonb_build_object(
      'open', (SELECT count(*) FROM public.question_reports WHERE status = 'open'),
      'reviewing', (SELECT count(*) FROM public.question_reports WHERE status = 'reviewing')
    ),
    'recent_users', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'full_name', t.full_name, 'email', t.email, 'created_at', t.created_at) ORDER BY t.created_at DESC)
      FROM (SELECT id, full_name, email, created_at FROM public.profiles ORDER BY created_at DESC LIMIT 10) t), '[]'::jsonb),
    'recent_payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'amount', t.amount, 'status', t.status, 'created_at', t.created_at, 'full_name', t.full_name) ORDER BY t.created_at DESC)
      FROM (SELECT p.id, p.amount, p.status, p.created_at, pr.full_name
            FROM public.payments p LEFT JOIN public.profiles pr ON pr.id = p.user_id
            ORDER BY p.created_at DESC LIMIT 10) t), '[]'::jsonb),
    'open_reports', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'reason', t.reason, 'question_id', t.question_id, 'created_at', t.created_at) ORDER BY t.created_at DESC)
      FROM (SELECT id, reason, question_id, created_at FROM public.question_reports WHERE status = 'open' ORDER BY created_at DESC LIMIT 10) t), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.admin_analytics_overview(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_analytics_overview(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_recent_audit(p_limit integer DEFAULT 8)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id, 'actor_id', t.actor_id, 'actor_name', t.actor_name,
    'entity', t.entity, 'entity_id', t.entity_id, 'action', t.action, 'created_at', t.created_at
  ) ORDER BY t.created_at DESC), '[]'::jsonb) INTO r
  FROM (SELECT * FROM public.audit_logs ORDER BY created_at DESC LIMIT LEAST(COALESCE(p_limit, 8), 50)) t;
  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.admin_recent_audit(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_recent_audit(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search text DEFAULT NULL,
  p_role public.app_role DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_has_active_sub boolean DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_offset integer;
  v_total integer;
  v_items jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  p_page := GREATEST(COALESCE(p_page, 1), 1);
  p_page_size := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 200);
  v_offset := (p_page - 1) * p_page_size;

  WITH base AS (
    SELECT p.id, p.full_name, p.email, p.mobile, p.status, p.created_at,
      (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = p.id ORDER BY (ur.role = 'admin') DESC LIMIT 1) AS role,
      s.id AS sub_id, s.status AS sub_status, s.expires_at AS sub_expires_at, pl.title AS plan_title
    FROM public.profiles p
    LEFT JOIN LATERAL (
      SELECT s2.* FROM public.subscriptions s2
      WHERE s2.user_id = p.id AND s2.status IN ('active','trial') AND (s2.expires_at IS NULL OR s2.expires_at > now())
      ORDER BY s2.expires_at DESC NULLS FIRST LIMIT 1
    ) s ON true
    LEFT JOIN public.plans pl ON pl.id = s.plan_id
  ), filtered AS (
    SELECT * FROM base b
    WHERE (p_search IS NULL OR p_search = ''
        OR b.full_name ILIKE '%'||p_search||'%'
        OR COALESCE(b.email,'') ILIKE '%'||p_search||'%'
        OR COALESCE(b.mobile,'') ILIKE '%'||p_search||'%')
      AND (p_role IS NULL OR b.role = p_role)
      AND (p_status IS NULL OR p_status = '' OR b.status = p_status)
      AND (p_has_active_sub IS NULL
        OR (p_has_active_sub AND b.sub_id IS NOT NULL)
        OR (NOT p_has_active_sub AND b.sub_id IS NULL))
      AND (p_from IS NULL OR b.created_at >= p_from)
      AND (p_to IS NULL OR b.created_at <= p_to)
  )
  SELECT (SELECT count(*) FROM filtered),
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', t.id, 'full_name', t.full_name, 'email', t.email, 'mobile', t.mobile,
      'status', t.status, 'created_at', t.created_at, 'role', t.role,
      'has_active_sub', (t.sub_id IS NOT NULL),
      'sub_status', t.sub_status, 'sub_expires_at', t.sub_expires_at, 'plan_title', t.plan_title
    ) ORDER BY t.created_at DESC)
    FROM (SELECT * FROM filtered ORDER BY created_at DESC LIMIT p_page_size OFFSET v_offset) t), '[]'::jsonb)
  INTO v_total, v_items;

  RETURN jsonb_build_object('items', v_items, 'total', v_total, 'page', p_page, 'page_size', p_page_size);
END $$;

REVOKE ALL ON FUNCTION public.admin_list_users(text, public.app_role, text, boolean, timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, public.app_role, text, boolean, timestamptz, timestamptz, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_get_user_detail(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    'subscriptions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'status', s.status, 'plan_id', s.plan_id, 'plan_title', pl.title,
        'started_at', s.started_at, 'expires_at', s.expires_at, 'created_at', s.created_at
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
        'started_at', a.started_at, 'submitted_at', a.submitted_at
      ) ORDER BY a.created_at DESC)
      FROM (SELECT * FROM public.exam_attempts WHERE candidate_id = p.id ORDER BY created_at DESC LIMIT 25) a
      LEFT JOIN public.exams e ON e.id = a.exam_id), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', pay.id, 'amount', pay.amount, 'status', pay.status, 'gateway', pay.gateway,
        'ref_id', pay.ref_id, 'plan_title', pl2.title, 'created_at', pay.created_at, 'paid_at', pay.paid_at
      ) ORDER BY pay.created_at DESC)
      FROM (SELECT * FROM public.payments WHERE user_id = p.id ORDER BY created_at DESC LIMIT 25) pay
      LEFT JOIN public.plans pl2 ON pl2.id = pay.plan_id), '[]'::jsonb),
    'reports', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', qr.id, 'question_id', qr.question_id, 'reason', qr.reason, 'status', qr.status,
        'description', qr.description, 'created_at', qr.created_at
      ) ORDER BY qr.created_at DESC)
      FROM public.question_reports qr WHERE qr.reporter_id = p.id), '[]'::jsonb),
    'audit', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', al.id, 'entity', al.entity, 'entity_id', al.entity_id, 'action', al.action,
        'actor_name', al.actor_name, 'details', al.details, 'created_at', al.created_at
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
END $$;

REVOKE ALL ON FUNCTION public.admin_get_user_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_detail(uuid) TO authenticated, service_role;