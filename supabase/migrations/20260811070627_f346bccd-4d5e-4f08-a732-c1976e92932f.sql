
-- ============ Admin / roles ============
CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN RETURN false; END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (v_uid,'admin') ON CONFLICT DO NOTHING;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, _role) ON CONFLICT DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.log_audit(_entity text, _entity_id uuid, _action text, _details jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.audit_logs(actor_id, actor_name, entity, entity_id, action, details)
  VALUES (auth.uid(), (SELECT full_name FROM public.profiles WHERE id = auth.uid()), _entity, _entity_id, _action, COALESCE(_details,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- ============ Admin reporting ============
CREATE OR REPLACE FUNCTION public.admin_subscription_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'total', count(*),
    'active', count(*) FILTER (WHERE status = 'active' AND (expires_at IS NULL OR expires_at > now())),
    'trial', count(*) FILTER (WHERE status = 'trial'),
    'expired', count(*) FILTER (WHERE status = 'expired' OR (expires_at IS NOT NULL AND expires_at <= now())),
    'cancelled', count(*) FILTER (WHERE status = 'cancelled')
  ) INTO r FROM public.subscriptions;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_subscriptions(p_search text DEFAULT NULL, p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) INTO r FROM (
    SELECT jsonb_build_object(
      'id', s.id, 'user_id', s.user_id, 'full_name', p.full_name, 'email', p.email,
      'mobile', p.mobile, 'plan_id', s.plan_id, 'plan_title', pl.title,
      'status', s.status, 'started_at', s.started_at, 'expires_at', s.expires_at,
      'created_at', s.created_at) AS x
    FROM public.subscriptions s
    JOIN public.profiles p ON p.id = s.user_id
    LEFT JOIN public.plans pl ON pl.id = s.plan_id
    WHERE (p_status IS NULL OR s.status = p_status)
      AND (p_search IS NULL OR p_search = '' OR p.full_name ILIKE '%'||p_search||'%'
           OR p.email ILIKE '%'||p_search||'%' OR p.mobile ILIKE '%'||p_search||'%')
  ) t;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_subscription_status(p_user_id uuid, p_status text, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.subscriptions SET status = p_status WHERE user_id = p_user_id;
  PERFORM public.log_audit('subscriptions', p_user_id, 'set_status', jsonb_build_object('status',p_status,'reason',p_reason));
  RETURN jsonb_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_grant_subscription(p_user_id uuid, p_days integer, p_reason text DEFAULT NULL, p_plan_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub public.subscriptions; v_expires timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 1;
  v_expires := GREATEST(COALESCE(v_sub.expires_at, now()), now()) + make_interval(days => p_days);
  IF v_sub.id IS NULL THEN
    INSERT INTO public.subscriptions(user_id, plan_id, status, expires_at, created_by)
    VALUES (p_user_id, p_plan_id, 'active', v_expires, auth.uid()) RETURNING * INTO v_sub;
  ELSE
    UPDATE public.subscriptions SET status='active', expires_at=v_expires,
      plan_id = COALESCE(p_plan_id, plan_id) WHERE id = v_sub.id RETURNING * INTO v_sub;
  END IF;
  INSERT INTO public.admin_subscription_grants(user_id, admin_id, days, expires_at, reason)
  VALUES (p_user_id, auth.uid(), p_days, v_expires, p_reason);
  PERFORM public.log_audit('subscriptions', v_sub.id, 'grant', jsonb_build_object('days',p_days,'reason',p_reason));
  RETURN jsonb_build_object('id', v_sub.id, 'expires_at', v_expires);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_payments(p_search text DEFAULT NULL, p_status text DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO r FROM (
    SELECT jsonb_build_object(
      'id', pay.id, 'user_id', pay.user_id, 'full_name', p.full_name, 'email', p.email,
      'amount', pay.amount, 'currency', pay.currency, 'gateway', pay.gateway,
      'status', pay.status, 'ref_id', pay.ref_id, 'authority', pay.authority,
      'plan_title', pl.title, 'paid_at', pay.paid_at, 'created_at', pay.created_at) AS x
    FROM public.payments pay
    JOIN public.profiles p ON p.id = pay.user_id
    LEFT JOIN public.plans pl ON pl.id = pay.plan_id
    WHERE (p_status IS NULL OR pay.status = p_status)
      AND (p_search IS NULL OR p_search = '' OR p.full_name ILIKE '%'||p_search||'%'
           OR p.email ILIKE '%'||p_search||'%' OR pay.ref_id ILIKE '%'||p_search||'%'
           OR pay.authority ILIKE '%'||p_search||'%')
    ORDER BY pay.created_at DESC LIMIT GREATEST(COALESCE(p_limit,100),1)
  ) t;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_payment_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'total_count', count(*),
    'paid_count', count(*) FILTER (WHERE status IN ('paid','verified')),
    'failed_count', count(*) FILTER (WHERE status IN ('failed','cancelled')),
    'pending_count', count(*) FILTER (WHERE status IN ('pending','processing')),
    'revenue', COALESCE(sum(amount) FILTER (WHERE status IN ('paid','verified')),0)
  ) INTO r FROM public.payments;
  RETURN r;
END; $$;

-- ============ Taxonomy ============
CREATE OR REPLACE FUNCTION public.save_organization(p_id uuid, p_name text, p_slug text, p_description text DEFAULT NULL,
  p_display_order integer DEFAULT 0, p_status text DEFAULT 'active')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.organizations(name, slug, description, display_order, status)
    VALUES (p_name, p_slug, p_description, COALESCE(p_display_order,0), COALESCE(p_status,'active')) RETURNING id INTO v_id;
  ELSE
    UPDATE public.organizations SET name=p_name, slug=p_slug, description=p_description,
      display_order=COALESCE(p_display_order,0), status=COALESCE(p_status,'active') WHERE id=p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.save_subject(p_id uuid, p_name text, p_slug text, p_description text DEFAULT NULL,
  p_display_order integer DEFAULT 0, p_status text DEFAULT 'active')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.subjects(name, slug, description, display_order, status)
    VALUES (p_name, p_slug, p_description, COALESCE(p_display_order,0), COALESCE(p_status,'active')) RETURNING id INTO v_id;
  ELSE
    UPDATE public.subjects SET name=p_name, slug=p_slug, description=p_description,
      display_order=COALESCE(p_display_order,0), status=COALESCE(p_status,'active') WHERE id=p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.save_category(p_id uuid, p_name text, p_slug text, p_description text DEFAULT NULL,
  p_parent_id uuid DEFAULT NULL, p_display_order integer DEFAULT 0, p_status text DEFAULT 'active')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.categories(name, slug, description, parent_id, display_order, status)
    VALUES (p_name, p_slug, p_description, p_parent_id, COALESCE(p_display_order,0), COALESCE(p_status,'active')) RETURNING id INTO v_id;
  ELSE
    UPDATE public.categories SET name=p_name, slug=p_slug, description=p_description, parent_id=p_parent_id,
      display_order=COALESCE(p_display_order,0), status=COALESCE(p_status,'active') WHERE id=p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_organization(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.organizations WHERE id = p_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_subject(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.subjects WHERE id = p_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_category(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.categories WHERE id = p_id;
END; $$;

CREATE OR REPLACE FUNCTION public.set_exam_categories(p_exam_id uuid, p_category_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.exam_categories WHERE exam_id = p_exam_id
    AND (p_category_ids IS NULL OR NOT (category_id = ANY(p_category_ids)));
  IF p_category_ids IS NOT NULL THEN
    INSERT INTO public.exam_categories(exam_id, category_id)
    SELECT p_exam_id, c FROM unnest(p_category_ids) AS c
    ON CONFLICT (exam_id, category_id) DO NOTHING;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.set_exam_subjects(p_exam_id uuid, p_rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.exam_subjects WHERE exam_id = p_exam_id;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows,'[]'::jsonb)) LOOP
    INSERT INTO public.exam_subjects(exam_id, subject_id, coefficient, question_count, time_limit_minutes, negative_marking, display_order)
    VALUES (p_exam_id, (r->>'subject_id')::uuid, COALESCE((r->>'coefficient')::numeric,1),
            COALESCE((r->>'question_count')::int,0), NULLIF(r->>'time_limit_minutes','')::int,
            COALESCE((r->>'negative_marking')::boolean,false), COALESCE((r->>'display_order')::int,0))
    ON CONFLICT (exam_id, subject_id) DO NOTHING;
  END LOOP;
END; $$;

-- ============ Question bank ============
CREATE OR REPLACE FUNCTION public.save_question(p_id uuid, p_text text, p_difficulty text, p_status text,
  p_category_id uuid, p_score numeric, p_options jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; o jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.questions(question_text, difficulty, status, category_id, default_score, created_by)
    VALUES (p_text, COALESCE(p_difficulty,'medium'), COALESCE(p_status,'active'), p_category_id, COALESCE(p_score,1), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.questions SET question_text=p_text, difficulty=COALESCE(p_difficulty,'medium'),
      status=COALESCE(p_status,'active'), category_id=p_category_id, default_score=COALESCE(p_score,1)
    WHERE id=p_id RETURNING id INTO v_id;
  END IF;
  IF p_options IS NOT NULL THEN
    DELETE FROM public.question_options WHERE question_id = v_id;
    FOR o IN SELECT * FROM jsonb_array_elements(p_options) LOOP
      INSERT INTO public.question_options(question_id, option_text, is_correct, display_order)
      VALUES (v_id, o->>'text', COALESCE((o->>'is_correct')::boolean,false), COALESCE((o->>'order')::int,0));
    END LOOP;
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.import_questions(p_exam_id uuid, p_exam_title text, p_category_ids uuid[], p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; o jsonb; v_qid uuid; v_count int := 0; v_order int := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows,'[]'::jsonb)) LOOP
    INSERT INTO public.questions(question_text, difficulty, status, category_id, default_score, created_by)
    VALUES (r->>'question_text', COALESCE(r->>'difficulty','medium'), 'active',
            COALESCE(NULLIF(r->>'category_id','')::uuid, (p_category_ids)[1]),
            COALESCE((r->>'score')::numeric,1), auth.uid())
    RETURNING id INTO v_qid;
    FOR o IN SELECT * FROM jsonb_array_elements(COALESCE(r->'options','[]'::jsonb)) LOOP
      INSERT INTO public.question_options(question_id, option_text, is_correct, display_order)
      VALUES (v_qid, o->>'text', COALESCE((o->>'is_correct')::boolean,false), COALESCE((o->>'order')::int,0));
    END LOOP;
    IF p_exam_id IS NOT NULL THEN
      v_order := v_order + 1;
      INSERT INTO public.exam_questions(exam_id, question_id, display_order, score)
      VALUES (p_exam_id, v_qid, v_order, COALESCE((r->>'score')::numeric,1))
      ON CONFLICT (exam_id, question_id) DO NOTHING;
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('imported', v_count, 'exam_id', p_exam_id, 'exam_title', p_exam_title);
END; $$;

-- ============ Exam CRUD ============
CREATE OR REPLACE FUNCTION public.save_exam_v2(p_id uuid, p_slug text, p_title text, p_description text,
  p_keywords text, p_meta_title text, p_meta_description text, p_access_type text, p_category_id uuid,
  p_organization_id uuid, p_level text, p_duration_minutes integer, p_max_attempts integer,
  p_passing_score numeric, p_randomize_questions boolean, p_randomize_options boolean,
  p_show_correct_answers boolean, p_is_free boolean, p_price numeric, p_status text,
  p_year integer, p_period text, p_round text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.exams(slug,title,description,keywords,meta_title,meta_description,access_type,
      category_id,organization_id,level,duration_minutes,max_attempts,passing_score,randomize_questions,
      randomize_options,show_correct_answers,is_free,price,status,year,period,round,created_by)
    VALUES (p_slug,p_title,p_description,p_keywords,p_meta_title,p_meta_description,COALESCE(p_access_type,'public'),
      p_category_id,p_organization_id,p_level,COALESCE(p_duration_minutes,60),COALESCE(p_max_attempts,1),
      COALESCE(p_passing_score,50),COALESCE(p_randomize_questions,false),COALESCE(p_randomize_options,false),
      COALESCE(p_show_correct_answers,false),COALESCE(p_is_free,true),COALESCE(p_price,0),
      COALESCE(p_status,'draft'),p_year,p_period,p_round,auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.exams SET slug=p_slug,title=p_title,description=p_description,keywords=p_keywords,
      meta_title=p_meta_title,meta_description=p_meta_description,access_type=COALESCE(p_access_type,'public'),
      category_id=p_category_id,organization_id=p_organization_id,level=p_level,
      duration_minutes=COALESCE(p_duration_minutes,60),max_attempts=COALESCE(p_max_attempts,1),
      passing_score=COALESCE(p_passing_score,50),randomize_questions=COALESCE(p_randomize_questions,false),
      randomize_options=COALESCE(p_randomize_options,false),show_correct_answers=COALESCE(p_show_correct_answers,false),
      is_free=COALESCE(p_is_free,true),price=COALESCE(p_price,0),status=COALESCE(p_status,'draft'),
      year=p_year,period=p_period,round=p_round
    WHERE id=p_id RETURNING id INTO v_id;
  END IF;
  PERFORM public.log_audit('exams', v_id, CASE WHEN p_id IS NULL THEN 'create' ELSE 'update' END, '{}'::jsonb);
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_exam(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.exams WHERE id = p_id;
  PERFORM public.log_audit('exams', p_id, 'delete', '{}'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.add_exam_question(p_exam_id uuid, p_question_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.exam_questions(exam_id, question_id, display_order, score)
  SELECT p_exam_id, p_question_id,
    COALESCE((SELECT max(display_order)+1 FROM public.exam_questions WHERE exam_id=p_exam_id),1),
    COALESCE((SELECT default_score FROM public.questions WHERE id=p_question_id),1)
  ON CONFLICT (exam_id, question_id) DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.remove_exam_question(p_exam_id uuid, p_question_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.exam_questions WHERE exam_id = p_exam_id AND question_id = p_question_id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_exam_admin(p_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'id', e.id, 'slug', e.slug, 'title', e.title, 'description', e.description,
    'keywords', e.keywords, 'meta_title', e.meta_title, 'meta_description', e.meta_description,
    'access_type', e.access_type, 'category_id', e.category_id, 'organization_id', e.organization_id,
    'level', e.level, 'duration_minutes', e.duration_minutes, 'max_attempts', e.max_attempts,
    'passing_score', e.passing_score, 'randomize_questions', e.randomize_questions,
    'randomize_options', e.randomize_options, 'show_correct_answers', e.show_correct_answers,
    'is_free', e.is_free, 'price', e.price, 'status', e.status,
    'year', e.year, 'period', e.period, 'round', e.round,
    'subjects', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', es.id, 'subject_id', es.subject_id, 'name', s.name,
        'coefficient', es.coefficient, 'question_count', es.question_count,
        'time_limit_minutes', es.time_limit_minutes, 'negative_marking', es.negative_marking,
        'display_order', es.display_order) ORDER BY es.display_order)
      FROM public.exam_subjects es JOIN public.subjects s ON s.id = es.subject_id
      WHERE es.exam_id = e.id), '[]'::jsonb),
    'categories', COALESCE((SELECT jsonb_agg(ec.category_id)
      FROM public.exam_categories ec WHERE ec.exam_id = e.id), '[]'::jsonb),
    'question_ids', COALESCE((SELECT jsonb_agg(eq.question_id ORDER BY eq.display_order)
      FROM public.exam_questions eq WHERE eq.exam_id = e.id), '[]'::jsonb)
  ) INTO r FROM public.exams e WHERE e.id = p_exam_id;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.list_questions_admin(p_search text DEFAULT NULL, p_category_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total int; v_items jsonb; v_off int; v_lim int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_lim := GREATEST(COALESCE(p_page_size,20),1);
  v_off := (GREATEST(COALESCE(p_page,1),1) - 1) * v_lim;
  SELECT count(*)::int,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', q.id, 'question_text', q.question_text, 'difficulty', q.difficulty,
        'status', q.status, 'category_id', q.category_id, 'default_score', q.default_score,
        'category_name', c.name,
        'option_count', (SELECT count(*) FROM public.question_options qo WHERE qo.question_id = q.id),
        'created_at', q.created_at)
      ORDER BY q.created_at DESC)
      FROM public.questions q LEFT JOIN public.categories c ON c.id = q.category_id
      WHERE (p_search IS NULL OR p_search='' OR q.question_text ILIKE '%'||p_search||'%')
        AND (p_category_id IS NULL OR q.category_id = p_category_id)
      OFFSET v_off LIMIT v_lim), '[]'::jsonb)
  INTO v_total, v_items FROM public.questions q
  WHERE (p_search IS NULL OR p_search='' OR q.question_text ILIKE '%'||p_search||'%')
    AND (p_category_id IS NULL OR q.category_id = p_category_id);
  RETURN jsonb_build_object('items', v_items, 'total', v_total, 'page', GREATEST(COALESCE(p_page,1),1), 'page_size', v_lim);
END; $$;

CREATE OR REPLACE FUNCTION public.list_attempts_admin(p_search text DEFAULT NULL, p_status text DEFAULT NULL,
  p_exam_id uuid DEFAULT NULL, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total int; v_items jsonb; v_off int; v_lim int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_lim := GREATEST(COALESCE(p_page_size,20),1);
  v_off := (GREATEST(COALESCE(p_page,1),1) - 1) * v_lim;
  SELECT count(*)::int,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'exam_id', a.exam_id, 'exam_title', e.title, 'candidate_id', a.candidate_id,
        'full_name', p.full_name, 'email', p.email, 'status', a.status,
        'started_at', a.started_at, 'submitted_at', a.submitted_at,
        'correct_count', a.correct_count, 'earned_score', a.earned_score,
        'total_score', a.total_score, 'passed', a.passed) ORDER BY a.created_at DESC)
      FROM public.exam_attempts a
      JOIN public.exams e ON e.id = a.exam_id
      JOIN public.profiles p ON p.id = a.candidate_id
      WHERE (p_status IS NULL OR a.status = p_status)
        AND (p_exam_id IS NULL OR a.exam_id = p_exam_id)
        AND (p_search IS NULL OR p_search='' OR p.full_name ILIKE '%'||p_search||'%'
             OR p.email ILIKE '%'||p_search||'%')
      OFFSET v_off LIMIT v_lim), '[]'::jsonb)
  INTO v_total, v_items FROM public.exam_attempts a
  JOIN public.exams e ON e.id = a.exam_id
  JOIN public.profiles p ON p.id = a.candidate_id
  WHERE (p_status IS NULL OR a.status = p_status)
    AND (p_exam_id IS NULL OR a.exam_id = p_exam_id)
    AND (p_search IS NULL OR p_search='' OR p.full_name ILIKE '%'||p_search||'%'
         OR p.email ILIKE '%'||p_search||'%');
  RETURN jsonb_build_object('items', v_items, 'total', v_total, 'page', GREATEST(COALESCE(p_page,1),1), 'page_size', v_lim);
END; $$;