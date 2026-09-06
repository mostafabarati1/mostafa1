-- ===== ماژول تمرین =====

-- 1) کش پاسخ تشریحی هوش مصنوعی
ALTER TABLE public.ai_explanations ADD COLUMN IF NOT EXISTS content_checksum text;
ALTER TABLE public.ai_explanations ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

GRANT SELECT ON public.ai_explanations TO authenticated;
GRANT ALL ON public.ai_explanations TO service_role;
ALTER TABLE public.ai_explanations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_explanations_select ON public.ai_explanations;
CREATE POLICY ai_explanations_select ON public.ai_explanations
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS ai_explanations_admin_write ON public.ai_explanations;
CREATE POLICY ai_explanations_admin_write ON public.ai_explanations
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- چک‌سام محتوای سوال برای اعتبارسنجی کش
CREATE OR REPLACE FUNCTION public.question_checksum(_question_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT md5(
    coalesce(q.question_text,'') || '|' ||
    coalesce((
      SELECT string_agg(o.option_text || ':' || o.is_correct::text, '§' ORDER BY o.display_order, o.id)
      FROM public.question_options o WHERE o.question_id = q.id
    ), '')
  )
  FROM public.questions q WHERE q.id = _question_id;
$$;
REVOKE ALL ON FUNCTION public.question_checksum(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.question_checksum(uuid) TO authenticated, service_role;

-- 2) گزینه‌های فیلتر تمرین
CREATE OR REPLACE FUNCTION public.practice_filters()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'categories', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.display_order, c.name)
        FROM public.categories c WHERE c.status = 'active'), '[]'::jsonb),
    'subjects', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.display_order, s.name)
        FROM public.subjects s WHERE s.status = 'active'), '[]'::jsonb),
    'organizations', coalesce((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) ORDER BY o.display_order, o.name)
        FROM public.organizations o WHERE o.status = 'active'), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.practice_filters() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.practice_filters() TO authenticated, service_role;

-- 3) فهرست سوالات تمرینی
CREATE OR REPLACE FUNCTION public.list_practice_questions(
  p_category_id uuid DEFAULT NULL,
  p_subject_id uuid DEFAULT NULL,
  p_difficulty text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
  v_items jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _pq(id uuid) ON COMMIT DROP;

  WITH base AS (
    SELECT q.id
    FROM public.questions q
    WHERE q.status = 'active'
      AND (p_category_id IS NULL OR q.category_id = p_category_id)
      AND (p_subject_id IS NULL OR q.subject_id = p_subject_id)
      AND (p_difficulty IS NULL OR q.difficulty = p_difficulty)
      AND (p_search IS NULL OR q.question_text ILIKE '%' || p_search || '%')
      AND (p_organization_id IS NULL OR EXISTS (
            SELECT 1 FROM public.exam_questions eq
            JOIN public.exams e ON e.id = eq.exam_id
            WHERE eq.question_id = q.id AND e.organization_id = p_organization_id))
  )
  SELECT count(*) INTO v_total FROM base;

  SELECT coalesce(jsonb_agg(item ORDER BY item->>'created_at' DESC), '[]'::jsonb) INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'id', q.id,
      'question_text', q.question_text,
      'difficulty', q.difficulty,
      'created_at', q.created_at,
      'category', (SELECT c.name FROM public.categories c WHERE c.id = q.category_id),
      'subject', (SELECT s.name FROM public.subjects s WHERE s.id = q.subject_id),
      'has_explanation', EXISTS (
        SELECT 1 FROM public.ai_explanations x
        WHERE x.question_id = q.id AND x.explanation IS NOT NULL
          AND x.content_checksum IS NOT DISTINCT FROM public.question_checksum(q.id)),
      'options', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', o.id, 'option_text', o.option_text, 'is_correct', o.is_correct)
               ORDER BY o.display_order, o.id)
        FROM public.question_options o WHERE o.question_id = q.id), '[]'::jsonb)
    ) AS item
    FROM public.questions q
    WHERE q.status = 'active'
      AND (p_category_id IS NULL OR q.category_id = p_category_id)
      AND (p_subject_id IS NULL OR q.subject_id = p_subject_id)
      AND (p_difficulty IS NULL OR q.difficulty = p_difficulty)
      AND (p_search IS NULL OR q.question_text ILIKE '%' || p_search || '%')
      AND (p_organization_id IS NULL OR EXISTS (
            SELECT 1 FROM public.exam_questions eq
            JOIN public.exams e ON e.id = eq.exam_id
            WHERE eq.question_id = q.id AND e.organization_id = p_organization_id))
    ORDER BY q.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) s;

  RETURN jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'items', v_items);
END; $$;
REVOKE ALL ON FUNCTION public.list_practice_questions(uuid,uuid,text,uuid,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_practice_questions(uuid,uuid,text,uuid,text,integer,integer) TO authenticated, service_role;

-- 4) دریافت پاسخ تشریحی ذخیره‌شده
CREATE OR REPLACE FUNCTION public.get_ai_explanation(p_question_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.ai_explanations; v_sum text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  v_sum := public.question_checksum(p_question_id);
  SELECT * INTO v_row FROM public.ai_explanations WHERE question_id = p_question_id;
  IF v_row.question_id IS NULL OR v_row.explanation IS NULL
     OR v_row.content_checksum IS DISTINCT FROM v_sum THEN
    RETURN jsonb_build_object('cached', false, 'checksum', v_sum);
  END IF;
  RETURN jsonb_build_object('cached', true, 'checksum', v_sum,
    'explanation', v_row.explanation, 'model', v_row.model, 'created_at', v_row.created_at);
END; $$;
REVOKE ALL ON FUNCTION public.get_ai_explanation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_explanation(uuid) TO authenticated, service_role;

-- 5) جلسه‌های تمرین
CREATE TABLE IF NOT EXISTS public.practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_ids uuid[] NOT NULL DEFAULT '{}',
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  difficulty text CHECK (difficulty IN ('easy','medium','hard')),
  question_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','finished')),
  correct_count integer NOT NULL DEFAULT 0,
  incorrect_count integer NOT NULL DEFAULT 0,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_user ON public.practice_sessions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.practice_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.practice_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_option_id uuid REFERENCES public.question_options(id) ON DELETE SET NULL,
  is_correct boolean,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id)
);

GRANT SELECT ON public.practice_sessions TO authenticated;
GRANT SELECT ON public.practice_answers TO authenticated;
GRANT ALL ON public.practice_sessions, public.practice_answers TO service_role;

ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS practice_sessions_select ON public.practice_sessions;
CREATE POLICY practice_sessions_select ON public.practice_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS practice_answers_select ON public.practice_answers;
CREATE POLICY practice_answers_select ON public.practice_answers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.practice_sessions s
                 WHERE s.id = session_id AND (s.user_id = auth.uid() OR public.is_admin())));

DROP TRIGGER IF EXISTS trg_practice_sessions_updated_at ON public.practice_sessions;
CREATE TRIGGER trg_practice_sessions_updated_at BEFORE UPDATE ON public.practice_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- شروع جلسه تمرین با انتخاب چند درس
CREATE OR REPLACE FUNCTION public.start_practice_session(
  p_subject_ids uuid[] DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_difficulty text DEFAULT NULL,
  p_count integer DEFAULT 10
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer := least(greatest(coalesce(p_count, 10), 1), 60);
  v_ids uuid[];
  v_session uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT array_agg(id) INTO v_ids FROM (
    SELECT q.id FROM public.questions q
    WHERE q.status = 'active'
      AND EXISTS (SELECT 1 FROM public.question_options o WHERE o.question_id = q.id AND o.is_correct)
      AND (p_subject_ids IS NULL OR array_length(p_subject_ids,1) IS NULL OR q.subject_id = ANY(p_subject_ids))
      AND (p_category_id IS NULL OR q.category_id = p_category_id)
      AND (p_difficulty IS NULL OR q.difficulty = p_difficulty)
      AND (p_organization_id IS NULL OR EXISTS (
            SELECT 1 FROM public.exam_questions eq JOIN public.exams e ON e.id = eq.exam_id
            WHERE eq.question_id = q.id AND e.organization_id = p_organization_id))
    ORDER BY random() LIMIT v_count
  ) t;

  IF v_ids IS NULL OR array_length(v_ids,1) IS NULL THEN
    RAISE EXCEPTION 'no_questions';
  END IF;

  INSERT INTO public.practice_sessions (user_id, subject_ids, category_id, organization_id, difficulty, question_ids)
  VALUES (v_uid, coalesce(p_subject_ids, '{}'), p_category_id, p_organization_id, p_difficulty, v_ids)
  RETURNING id INTO v_session;

  RETURN v_session;
END; $$;
REVOKE ALL ON FUNCTION public.start_practice_session(uuid[],uuid,uuid,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_practice_session(uuid[],uuid,uuid,text,integer) TO authenticated, service_role;

-- وضعیت جلسه تمرین
CREATE OR REPLACE FUNCTION public.get_practice_session(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_s public.practice_sessions; v_questions jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO v_s FROM public.practice_sessions WHERE id = p_session_id;
  IF v_s.id IS NULL OR (v_s.user_id <> v_uid AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  SELECT coalesce(jsonb_agg(item ORDER BY ord), '[]'::jsonb) INTO v_questions FROM (
    SELECT o.ord, jsonb_build_object(
      'id', q.id,
      'question_text', q.question_text,
      'difficulty', q.difficulty,
      'subject', (SELECT s.name FROM public.subjects s WHERE s.id = q.subject_id),
      'category', (SELECT c.name FROM public.categories c WHERE c.id = q.category_id),
      'options', coalesce((SELECT jsonb_agg(jsonb_build_object('id', op.id, 'option_text', op.option_text, 'is_correct', op.is_correct)
            ORDER BY op.display_order, op.id) FROM public.question_options op WHERE op.question_id = q.id), '[]'::jsonb),
      'answer', (SELECT jsonb_build_object('selected_option_id', a.selected_option_id, 'is_correct', a.is_correct)
                 FROM public.practice_answers a WHERE a.session_id = v_s.id AND a.question_id = q.id),
      'has_explanation', EXISTS (SELECT 1 FROM public.ai_explanations x WHERE x.question_id = q.id
            AND x.explanation IS NOT NULL AND x.content_checksum IS NOT DISTINCT FROM public.question_checksum(q.id))
    ) AS item
    FROM unnest(v_s.question_ids) WITH ORDINALITY AS o(qid, ord)
    JOIN public.questions q ON q.id = o.qid
  ) t;

  RETURN jsonb_build_object(
    'id', v_s.id, 'status', v_s.status, 'created_at', v_s.created_at,
    'finished_at', v_s.finished_at, 'difficulty', v_s.difficulty,
    'correct_count', v_s.correct_count, 'incorrect_count', v_s.incorrect_count,
    'total', coalesce(array_length(v_s.question_ids,1), 0),
    'questions', v_questions);
END; $$;
REVOKE ALL ON FUNCTION public.get_practice_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_practice_session(uuid) TO authenticated, service_role;

-- ثبت پاسخ تمرین
CREATE OR REPLACE FUNCTION public.answer_practice_question(
  p_session_id uuid, p_question_id uuid, p_option_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_s public.practice_sessions; v_correct boolean; v_correct_option uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO v_s FROM public.practice_sessions WHERE id = p_session_id AND user_id = v_uid;
  IF v_s.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_s.status <> 'in_progress' THEN RAISE EXCEPTION 'session_finished'; END IF;
  IF NOT (p_question_id = ANY(v_s.question_ids)) THEN RAISE EXCEPTION 'invalid_question'; END IF;

  SELECT o.id INTO v_correct_option FROM public.question_options o
  WHERE o.question_id = p_question_id AND o.is_correct LIMIT 1;

  SELECT (o.is_correct AND o.question_id = p_question_id) INTO v_correct
  FROM public.question_options o WHERE o.id = p_option_id;
  v_correct := coalesce(v_correct, false);

  INSERT INTO public.practice_answers (session_id, question_id, selected_option_id, is_correct)
  VALUES (p_session_id, p_question_id, p_option_id, v_correct)
  ON CONFLICT (session_id, question_id) DO UPDATE
    SET selected_option_id = EXCLUDED.selected_option_id,
        is_correct = EXCLUDED.is_correct,
        answered_at = now();

  UPDATE public.practice_sessions s SET
    correct_count = (SELECT count(*) FROM public.practice_answers a WHERE a.session_id = s.id AND a.is_correct),
    incorrect_count = (SELECT count(*) FROM public.practice_answers a WHERE a.session_id = s.id AND a.is_correct = false)
  WHERE s.id = p_session_id;

  RETURN jsonb_build_object('is_correct', v_correct, 'correct_option_id', v_correct_option);
END; $$;
REVOKE ALL ON FUNCTION public.answer_practice_question(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.answer_practice_question(uuid,uuid,uuid) TO authenticated, service_role;

-- پایان جلسه تمرین
CREATE OR REPLACE FUNCTION public.finish_practice_session(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_s public.practice_sessions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.practice_sessions SET status = 'finished', finished_at = now()
  WHERE id = p_session_id AND user_id = v_uid AND status = 'in_progress'
  RETURNING * INTO v_s;
  IF v_s.id IS NULL THEN
    SELECT * INTO v_s FROM public.practice_sessions WHERE id = p_session_id AND user_id = v_uid;
    IF v_s.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  END IF;
  RETURN jsonb_build_object('id', v_s.id, 'status', v_s.status,
    'correct_count', v_s.correct_count, 'incorrect_count', v_s.incorrect_count,
    'total', coalesce(array_length(v_s.question_ids,1),0));
END; $$;
REVOKE ALL ON FUNCTION public.finish_practice_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_practice_session(uuid) TO authenticated, service_role;

-- فهرست جلسه‌های تمرین کاربر
CREATE OR REPLACE FUNCTION public.list_practice_sessions(p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'status', s.status, 'created_at', s.created_at,
    'correct_count', s.correct_count, 'incorrect_count', s.incorrect_count,
    'total', coalesce(array_length(s.question_ids,1),0)) ORDER BY s.created_at DESC), '[]'::jsonb)
  FROM public.practice_sessions s
  WHERE s.user_id = auth.uid()
  LIMIT least(greatest(coalesce(p_limit,20),1),100);
$$;
REVOKE ALL ON FUNCTION public.list_practice_sessions(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_practice_sessions(integer) TO authenticated, service_role;