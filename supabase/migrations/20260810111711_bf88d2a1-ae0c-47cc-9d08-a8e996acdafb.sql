
CREATE OR REPLACE FUNCTION public.list_exams_public(
  p_search text DEFAULT NULL, p_category_id uuid DEFAULT NULL, p_organization_id uuid DEFAULT NULL,
  p_year integer DEFAULT NULL, p_subject_id uuid DEFAULT NULL, p_exam_type text DEFAULT NULL,
  p_is_free boolean DEFAULT NULL, p_level text DEFAULT NULL,
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 12)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total int; v_items jsonb; v_off int; v_lim int;
BEGIN
  v_lim := GREATEST(COALESCE(p_page_size,12),1);
  v_off := (GREATEST(COALESCE(p_page,1),1) - 1) * v_lim;
  WITH base AS (
    SELECT e.* FROM public.exams e
    WHERE e.status = 'published' AND e.access_type = 'public'
      AND (p_search IS NULL OR p_search = '' OR e.title ILIKE '%'||p_search||'%' OR e.description ILIKE '%'||p_search||'%')
      AND (p_category_id IS NULL OR e.category_id = p_category_id
           OR EXISTS (SELECT 1 FROM public.exam_categories ec WHERE ec.exam_id = e.id AND ec.category_id = p_category_id))
      AND (p_organization_id IS NULL OR e.organization_id = p_organization_id)
      AND (p_year IS NULL OR e.year = p_year)
      AND (p_subject_id IS NULL OR EXISTS (SELECT 1 FROM public.exam_subjects es WHERE es.exam_id = e.id AND es.subject_id = p_subject_id))
      AND (p_exam_type IS NULL OR p_exam_type = '' OR EXISTS (
            SELECT 1 FROM public.categories c
            WHERE c.slug = p_exam_type
              AND (e.category_id = c.id OR EXISTS (
                    SELECT 1 FROM public.categories cc WHERE cc.parent_id = c.id AND cc.id = e.category_id)
                   OR EXISTS (SELECT 1 FROM public.exam_categories ec WHERE ec.exam_id = e.id AND ec.category_id = c.id))))
      AND (p_is_free IS NULL OR e.is_free = p_is_free)
      AND (p_level IS NULL OR p_level = '' OR e.level = p_level)
  )
  SELECT count(*)::int,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'title', b.title, 'slug', b.slug, 'description', b.description,
        'level', b.level, 'year', b.year, 'period', b.period, 'round', b.round,
        'duration_minutes', b.duration_minutes, 'is_free', b.is_free, 'price', b.price,
        'category_id', b.category_id, 'organization_id', b.organization_id,
        'organization_name', o.name, 'category_name', c.name,
        'question_count', (SELECT count(*) FROM public.exam_questions eq WHERE eq.exam_id = b.id),
        'created_at', b.created_at) ORDER BY b.created_at DESC)
      FROM (SELECT * FROM base ORDER BY created_at DESC OFFSET v_off LIMIT v_lim) b
      LEFT JOIN public.organizations o ON o.id = b.organization_id
      LEFT JOIN public.categories c ON c.id = b.category_id), '[]'::jsonb)
  INTO v_total, v_items FROM base;

  RETURN jsonb_build_object('items', v_items, 'total', v_total,
    'page', GREATEST(COALESCE(p_page,1),1), 'page_size', v_lim);
END; $$;

CREATE OR REPLACE FUNCTION public.exam_catalog_tree()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  SELECT jsonb_build_object(
    'categories', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'slug', c.slug, 'parent_id', c.parent_id,
        'display_order', c.display_order,
        'exam_count', (SELECT count(*) FROM public.exams e
                       WHERE e.status='published' AND e.access_type='public' AND e.category_id = c.id))
      ORDER BY c.display_order, c.name)
      FROM public.categories c WHERE c.status='active'), '[]'::jsonb),
    'organizations', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.name, 'slug', o.slug, 'logo_url', o.logo_url)
      ORDER BY o.display_order, o.name)
      FROM public.organizations o WHERE o.status='active'), '[]'::jsonb),
    'subjects', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'slug', s.slug) ORDER BY s.display_order, s.name)
      FROM public.subjects s WHERE s.status='active'), '[]'::jsonb),
    'years', COALESCE((SELECT jsonb_agg(DISTINCT e.year) FROM public.exams e
      WHERE e.status='published' AND e.access_type='public' AND e.year IS NOT NULL), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.get_exam_public(p_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.exams; r jsonb;
BEGIN
  SELECT * INTO e FROM public.exams WHERE slug = p_slug;
  IF e.id IS NULL THEN RETURN NULL; END IF;
  IF NOT (e.status='published' AND e.access_type='public') AND NOT public.can_view_exam(e.id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'id', e.id, 'title', e.title, 'slug', e.slug, 'description', e.description,
    'keywords', e.keywords, 'meta_title', e.meta_title, 'meta_description', e.meta_description,
    'level', e.level, 'status', e.status, 'access_type', e.access_type,
    'duration_minutes', e.duration_minutes, 'max_attempts', e.max_attempts,
    'passing_score', e.passing_score, 'is_free', e.is_free, 'price', e.price,
    'year', e.year, 'period', e.period, 'round', e.round,
    'organization', (SELECT jsonb_build_object('id',o.id,'name',o.name,'slug',o.slug,'logo_url',o.logo_url)
                     FROM public.organizations o WHERE o.id = e.organization_id),
    'category', (SELECT jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug)
                 FROM public.categories c WHERE c.id = e.category_id),
    'subjects', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', es.id, 'subject_id', s.id, 'name', s.name, 'coefficient', es.coefficient,
        'question_count', es.question_count) ORDER BY es.display_order)
      FROM public.exam_subjects es JOIN public.subjects s ON s.id = es.subject_id
      WHERE es.exam_id = e.id), '[]'::jsonb),
    'question_count', (SELECT count(*) FROM public.exam_questions eq WHERE eq.exam_id = e.id)
  ) INTO r;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.get_exam_topics(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.can_view_exam(p_exam_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'slug', c.slug,
      'question_count', (SELECT count(*) FROM public.exam_questions eq
                         JOIN public.questions q ON q.id = eq.question_id
                         WHERE eq.exam_id = p_exam_id AND q.category_id = c.id))
    ORDER BY c.display_order, c.name), '[]'::jsonb) INTO r
  FROM public.categories c
  WHERE EXISTS (SELECT 1 FROM public.exam_questions eq JOIN public.questions q ON q.id = eq.question_id
                WHERE eq.exam_id = p_exam_id AND q.category_id = c.id);
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.start_attempt(p_exam_id uuid, p_category_ids uuid[] DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); e public.exams; v_id uuid; v_used int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
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
  VALUES (p_exam_id, v_uid, p_category_ids, now(),
          now() + make_interval(mins => COALESCE(e.duration_minutes,60)), 'in_progress')
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_attempt_state(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.exam_attempts; e public.exams; r jsonb;
BEGIN
  SELECT * INTO a FROM public.exam_attempts WHERE id = p_attempt_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'attempt not found'; END IF;
  IF a.candidate_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO e FROM public.exams WHERE id = a.exam_id;

  SELECT jsonb_build_object(
    'attempt', jsonb_build_object('id',a.id,'exam_id',a.exam_id,'status',a.status,
      'started_at',a.started_at,'expires_at',a.expires_at,'submitted_at',a.submitted_at,
      'category_ids',a.category_ids),
    'exam', jsonb_build_object('id',e.id,'title',e.title,'slug',e.slug,
      'duration_minutes',e.duration_minutes,'passing_score',e.passing_score),
    'questions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'question_id', q.id, 'question_text', q.question_text, 'score', eq.score,
        'display_order', eq.display_order,
        'selected_option_id', (SELECT aa.selected_option_id FROM public.attempt_answers aa
                               WHERE aa.attempt_id = a.id AND aa.question_id = q.id),
        'options', (SELECT jsonb_agg(jsonb_build_object('id',qo.id,'option_text',qo.option_text)
                    ORDER BY CASE WHEN e.randomize_options THEN NULL ELSE qo.display_order END, qo.id)
                    FROM public.question_options qo WHERE qo.question_id = q.id))
      ORDER BY CASE WHEN e.randomize_questions THEN NULL ELSE eq.display_order END, eq.id)
      FROM public.exam_questions eq JOIN public.questions q ON q.id = eq.question_id
      WHERE eq.exam_id = a.exam_id
        AND (a.category_ids IS NULL OR array_length(a.category_ids,1) IS NULL OR q.category_id = ANY(a.category_ids))
      ), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.save_answer(p_attempt_id uuid, p_question_id uuid, p_option_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.exam_attempts;
BEGIN
  SELECT * INTO a FROM public.exam_attempts WHERE id = p_attempt_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'attempt not found'; END IF;
  IF a.candidate_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF a.status <> 'in_progress' THEN RAISE EXCEPTION 'attempt is not active'; END IF;
  IF a.expires_at IS NOT NULL AND a.expires_at <= now() THEN
    UPDATE public.exam_attempts SET status='expired' WHERE id = a.id;
    RAISE EXCEPTION 'attempt expired';
  END IF;
  INSERT INTO public.attempt_answers(attempt_id, question_id, selected_option_id, answered_at)
  VALUES (p_attempt_id, p_question_id, p_option_id, now())
  ON CONFLICT (attempt_id, question_id)
  DO UPDATE SET selected_option_id = EXCLUDED.selected_option_id, answered_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.submit_attempt(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.exam_attempts; e public.exams;
  v_correct int := 0; v_incorrect int := 0; v_unanswered int := 0;
  v_total numeric := 0; v_earned numeric := 0; v_passed boolean := false; v_pct numeric := 0;
BEGIN
  SELECT * INTO a FROM public.exam_attempts WHERE id = p_attempt_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'attempt not found'; END IF;
  IF a.candidate_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO e FROM public.exams WHERE id = a.exam_id;

  UPDATE public.attempt_answers aa
  SET is_correct = COALESCE(qo.is_correct,false),
      score_awarded = CASE WHEN COALESCE(qo.is_correct,false)
        THEN COALESCE((SELECT eq.score FROM public.exam_questions eq
                       WHERE eq.exam_id = a.exam_id AND eq.question_id = aa.question_id),1)
        ELSE 0 END
  FROM public.question_options qo
  WHERE aa.attempt_id = a.id AND qo.id = aa.selected_option_id;

  UPDATE public.attempt_answers SET is_correct = false, score_awarded = 0
  WHERE attempt_id = a.id AND selected_option_id IS NULL;

  SELECT COALESCE(sum(eq.score),0) INTO v_total
  FROM public.exam_questions eq JOIN public.questions q ON q.id = eq.question_id
  WHERE eq.exam_id = a.exam_id
    AND (a.category_ids IS NULL OR array_length(a.category_ids,1) IS NULL OR q.category_id = ANY(a.category_ids));

  SELECT count(*) FILTER (WHERE is_correct), count(*) FILTER (WHERE NOT is_correct AND selected_option_id IS NOT NULL),
         COALESCE(sum(score_awarded),0)
  INTO v_correct, v_incorrect, v_earned
  FROM public.attempt_answers WHERE attempt_id = a.id;

  SELECT GREATEST(count(*)::int - (v_correct + v_incorrect), 0) INTO v_unanswered
  FROM public.exam_questions eq JOIN public.questions q ON q.id = eq.question_id
  WHERE eq.exam_id = a.exam_id
    AND (a.category_ids IS NULL OR array_length(a.category_ids,1) IS NULL OR q.category_id = ANY(a.category_ids));

  v_pct := CASE WHEN v_total > 0 THEN (v_earned / v_total) * 100 ELSE 0 END;
  v_passed := v_pct >= COALESCE(e.passing_score, 50);

  UPDATE public.exam_attempts SET status='graded', submitted_at = now(),
    correct_count = v_correct, incorrect_count = v_incorrect, unanswered_count = v_unanswered,
    total_score = v_total, earned_score = v_earned, passed = v_passed
  WHERE id = a.id;

  RETURN jsonb_build_object('attempt_id', a.id, 'correct_count', v_correct,
    'incorrect_count', v_incorrect, 'unanswered_count', v_unanswered,
    'total_score', v_total, 'earned_score', v_earned, 'percentage', round(v_pct,2), 'passed', v_passed);
END; $$;

CREATE OR REPLACE FUNCTION public.get_attempt_review(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.exam_attempts; e public.exams; r jsonb;
BEGIN
  SELECT * INTO a FROM public.exam_attempts WHERE id = p_attempt_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'attempt not found'; END IF;
  IF a.candidate_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF a.status = 'in_progress' THEN RAISE EXCEPTION 'attempt not submitted'; END IF;
  SELECT * INTO e FROM public.exams WHERE id = a.exam_id;

  SELECT jsonb_build_object(
    'attempt', jsonb_build_object('id',a.id,'status',a.status,'submitted_at',a.submitted_at,
      'correct_count',a.correct_count,'incorrect_count',a.incorrect_count,
      'unanswered_count',a.unanswered_count,'total_score',a.total_score,
      'earned_score',a.earned_score,'passed',a.passed),
    'exam', jsonb_build_object('id',e.id,'title',e.title,'slug',e.slug,'passing_score',e.passing_score),
    'questions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'question_id', q.id, 'question_text', q.question_text, 'score', eq.score,
        'selected_option_id', aa.selected_option_id, 'is_correct', aa.is_correct,
        'explanation', (SELECT x.explanation FROM public.ai_explanations x WHERE x.question_id = q.id),
        'options', (SELECT jsonb_agg(jsonb_build_object('id',qo.id,'option_text',qo.option_text,'is_correct',qo.is_correct)
                    ORDER BY qo.display_order) FROM public.question_options qo WHERE qo.question_id = q.id))
      ORDER BY eq.display_order)
      FROM public.exam_questions eq
      JOIN public.questions q ON q.id = eq.question_id
      LEFT JOIN public.attempt_answers aa ON aa.attempt_id = a.id AND aa.question_id = q.id
      WHERE eq.exam_id = a.exam_id
        AND (a.category_ids IS NULL OR array_length(a.category_ids,1) IS NULL OR q.category_id = ANY(a.category_ids))
      ), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.my_subscription()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); s public.subscriptions; r jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO s FROM public.subscriptions WHERE user_id = v_uid ORDER BY created_at DESC LIMIT 1;
  SELECT jsonb_build_object(
    'has_active', public.has_active_subscription(v_uid),
    'subscription', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', s.id, 'status', s.status, 'started_at', s.started_at, 'expires_at', s.expires_at,
      'plan', (SELECT jsonb_build_object('id',p.id,'title',p.title,'price',p.price,
               'duration_months',p.duration_months) FROM public.plans p WHERE p.id = s.plan_id)) END,
    'trial_ends_at', (SELECT trial_ends_at FROM public.profiles WHERE id = v_uid)
  ) INTO r;
  RETURN r;
END; $$;

-- ============ Reports ============
CREATE OR REPLACE FUNCTION public.report_question(p_question_id uuid, p_reason text, p_description text DEFAULT NULL,
  p_attempt_id uuid DEFAULT NULL, p_exam_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.question_reports(question_id, reporter_id, attempt_id, exam_id, reason, description)
  VALUES (p_question_id, auth.uid(), p_attempt_id, p_exam_id, p_reason, p_description)
  RETURNING id INTO v_id;
  PERFORM public.log_audit('question_reports', v_id, 'create', jsonb_build_object('question_id',p_question_id));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.list_question_reports()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', qr.id, 'question_id', qr.question_id, 'question_text', q.question_text,
    'reporter_id', qr.reporter_id, 'reporter_name', p.full_name,
    'exam_id', qr.exam_id, 'attempt_id', qr.attempt_id,
    'reason', qr.reason, 'description', qr.description, 'admin_note', qr.admin_note,
    'status', qr.status, 'created_at', qr.created_at) ORDER BY qr.created_at DESC), '[]'::jsonb) INTO r
  FROM public.question_reports qr
  LEFT JOIN public.questions q ON q.id = qr.question_id
  LEFT JOIN public.profiles p ON p.id = qr.reporter_id;
  RETURN r;
END; $$;

-- ============ Payments ============
CREATE OR REPLACE FUNCTION public.create_payment_intent(p_plan_id uuid, p_gateway text DEFAULT 'zarinpal')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); pl public.plans; v_id uuid; v_currency text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO pl FROM public.plans WHERE id = p_plan_id AND is_active;
  IF pl.id IS NULL THEN RAISE EXCEPTION 'plan not found'; END IF;
  SELECT currency INTO v_currency FROM public.payment_gateway_settings WHERE id;
  INSERT INTO public.payments(user_id, plan_id, amount, currency, gateway, status)
  VALUES (v_uid, pl.id, pl.price, COALESCE(v_currency,'IRT'), COALESCE(p_gateway,'zarinpal'), 'pending')
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('payment_id', v_id, 'amount', pl.price,
    'currency', COALESCE(v_currency,'IRT'), 'plan_title', pl.title);
END; $$;

CREATE OR REPLACE FUNCTION public.finalize_gateway_payment(p_payment_id uuid, p_ref_id text,
  p_amount numeric DEFAULT NULL, p_card_pan text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pay public.payments; pl public.plans; v_sub public.subscriptions; v_expires timestamptz;
BEGIN
  SELECT * INTO pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF pay.id IS NULL THEN RAISE EXCEPTION 'payment not found'; END IF;
  IF pay.status IN ('paid','verified') THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true,
      'payment_id', pay.id, 'subscription_id', pay.subscription_id);
  END IF;

  SELECT * INTO pl FROM public.plans WHERE id = pay.plan_id;
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = pay.user_id ORDER BY created_at DESC LIMIT 1;
  v_expires := GREATEST(COALESCE(v_sub.expires_at, now()), now())
               + make_interval(months => COALESCE(pl.duration_months,1));

  IF v_sub.id IS NULL THEN
    INSERT INTO public.subscriptions(user_id, plan_id, status, expires_at)
    VALUES (pay.user_id, pay.plan_id, 'active', v_expires) RETURNING * INTO v_sub;
  ELSE
    UPDATE public.subscriptions SET status='active', plan_id = COALESCE(pay.plan_id, plan_id),
      expires_at = v_expires WHERE id = v_sub.id RETURNING * INTO v_sub;
  END IF;

  UPDATE public.payments SET status='verified', ref_id = COALESCE(p_ref_id, ref_id),
    card_pan = COALESCE(p_card_pan, card_pan), amount = COALESCE(p_amount, amount),
    subscription_id = v_sub.id, paid_at = COALESCE(paid_at, now()), verified_at = now()
  WHERE id = pay.id;

  PERFORM public.log_audit('payments', pay.id, 'verified', jsonb_build_object('ref_id', p_ref_id));
  RETURN jsonb_build_object('ok', true, 'payment_id', pay.id,
    'subscription_id', v_sub.id, 'expires_at', v_expires);
END; $$;

CREATE OR REPLACE FUNCTION public.mark_gateway_payment_failed(p_payment_id uuid, p_status text DEFAULT 'failed', p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pay public.payments;
BEGIN
  IF p_status NOT IN ('failed','cancelled','refunded','processing') THEN RAISE EXCEPTION 'invalid status'; END IF;
  SELECT * INTO pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF pay.id IS NULL THEN RAISE EXCEPTION 'payment not found'; END IF;
  IF pay.status IN ('paid','verified') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already settled');
  END IF;
  UPDATE public.payments SET status = p_status, failure_reason = p_reason WHERE id = pay.id;
  RETURN jsonb_build_object('ok', true, 'payment_id', pay.id, 'status', p_status);
END; $$;

-- ============ Execute grants ============
REVOKE EXECUTE ON FUNCTION public.finalize_gateway_payment(uuid,text,numeric,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_gateway_payment_failed(uuid,text,text) FROM anon, authenticated;
