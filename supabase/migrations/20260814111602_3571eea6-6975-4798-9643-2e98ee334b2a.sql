CREATE OR REPLACE FUNCTION public.weak_topics_for_user(p_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF v_uid <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object(
        'category_id', c.id, 'name', c.name, 'subject_id', t.subject_id,
        'attempts', t.answered, 'correct_rate', t.correct_rate, 'last_attempt_at', t.last_at
      ) AS x, t.correct_rate
      FROM (
        SELECT q.category_id,
               mode() WITHIN GROUP (ORDER BY q.subject_id) AS subject_id,
               count(*) AS answered,
               round(avg(CASE WHEN aa.is_correct THEN 100.0 ELSE 0 END)::numeric, 1) AS correct_rate,
               max(a.submitted_at) AS last_at
        FROM attempt_answers aa
        JOIN exam_attempts a ON a.id = aa.attempt_id AND a.candidate_id = v_uid AND a.submitted_at IS NOT NULL
        JOIN questions q ON q.id = aa.question_id
        WHERE q.category_id IS NOT NULL
        GROUP BY q.category_id
      ) t JOIN categories c ON c.id = t.category_id
      ORDER BY t.correct_rate ASC
      LIMIT p_limit
    ) s
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.build_candidate_analytics(p_user_id uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_exam_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_from timestamptz := COALESCE(p_from::timestamptz, '-infinity'::timestamptz);
  v_to timestamptz := COALESCE((p_to + 1)::timestamptz, 'infinity'::timestamptz);
BEGIN
  WITH att AS (
    SELECT a.*
    FROM exam_attempts a
    WHERE a.candidate_id = p_user_id
      AND a.created_at >= v_from AND a.created_at < v_to
      AND (p_exam_id IS NULL OR a.exam_id = p_exam_id)
  ),
  graded AS (
    SELECT * FROM att WHERE submitted_at IS NOT NULL
  ),
  ans AS (
    SELECT aa.*, q.subject_id, q.category_id, q.difficulty, g.submitted_at
    FROM attempt_answers aa
    JOIN graded g ON g.id = aa.attempt_id
    JOIN questions q ON q.id = aa.question_id
  ),
  perf AS (
    SELECT
      (SELECT count(*) FROM att) AS attempts_total,
      (SELECT count(*) FROM graded WHERE passed) AS passed,
      (SELECT count(*) FROM graded WHERE NOT passed) AS failed,
      (SELECT round(avg(CASE WHEN total_score > 0 THEN earned_score / total_score * 100 ELSE 0 END)::numeric, 1)
         FROM graded) AS avg_percent,
      (SELECT round((sum(EXTRACT(EPOCH FROM (submitted_at - started_at))) / 60)::numeric, 0)
         FROM graded WHERE submitted_at IS NOT NULL AND started_at IS NOT NULL) AS total_time_minutes
  ),
  recent AS (
    SELECT jsonb_agg(x ORDER BY x_order DESC) AS items FROM (
      SELECT g.submitted_at AS x_order,
        jsonb_build_object(
          'exam_id', g.exam_id,
          'exam_title', e.title,
          'submitted_at', g.submitted_at,
          'percent', CASE WHEN g.total_score > 0 THEN round(g.earned_score / g.total_score * 100, 1) ELSE 0 END,
          'passed', g.passed
        ) AS x
      FROM graded g JOIN exams e ON e.id = g.exam_id
      ORDER BY g.submitted_at DESC NULLS LAST
      LIMIT 10
    ) t
  ),
  subj AS (
    SELECT jsonb_agg(jsonb_build_object(
      'subject_id', s.id, 'name', s.name,
      'attempts', c.answered,
      'correct_rate', c.correct_rate
    ) ORDER BY s.name) AS items
    FROM (
      SELECT subject_id, count(*) AS answered,
             round(avg(CASE WHEN is_correct THEN 100.0 ELSE 0 END)::numeric, 1) AS correct_rate
      FROM ans WHERE subject_id IS NOT NULL GROUP BY subject_id
    ) c JOIN subjects s ON s.id = c.subject_id
  ),
  topics AS (
    SELECT cat.id, cat.name, c.subject_id, c.answered, c.correct_rate, c.last_at
    FROM (
      SELECT category_id,
             mode() WITHIN GROUP (ORDER BY subject_id) AS subject_id,
             count(*) AS answered,
             round(avg(CASE WHEN is_correct THEN 100.0 ELSE 0 END)::numeric, 1) AS correct_rate,
             max(submitted_at) AS last_at
      FROM ans WHERE category_id IS NOT NULL GROUP BY category_id
    ) c JOIN categories cat ON cat.id = c.category_id
  ),
  diff AS (
    SELECT jsonb_agg(jsonb_build_object(
      'difficulty', d.difficulty,
      'answered', d.answered,
      'correct_rate', d.correct_rate,
      'avg_score_awarded', d.avg_score
    ) ORDER BY d.difficulty) AS items
    FROM (
      SELECT difficulty, count(*) AS answered,
             round(avg(CASE WHEN is_correct THEN 100.0 ELSE 0 END)::numeric, 1) AS correct_rate,
             round(avg(score_awarded)::numeric, 2) AS avg_score
      FROM ans GROUP BY difficulty
    ) d
  ),
  exam_meta AS (
    SELECT CASE WHEN p_exam_id IS NULL THEN NULL ELSE (
      SELECT jsonb_build_object(
        'id', e.id, 'title', e.title, 'level', e.level, 'year', e.year,
        'period', e.period, 'round', e.round, 'keywords', e.keywords,
        'description', e.description,
        'duration_minutes', e.duration_minutes, 'passing_score', e.passing_score,
        'is_free', e.is_free,
        'category_name', c.name, 'organization_name', o.name,
        'question_count', (SELECT count(*) FROM exam_questions eq WHERE eq.exam_id = e.id),
        'subjects', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'subject_id', s.id, 'name', s.name,
            'coefficient', es.coefficient, 'question_count', es.question_count,
            'negative_marking', es.negative_marking))
          FROM exam_subjects es JOIN subjects s ON s.id = es.subject_id
          WHERE es.exam_id = e.id), '[]'::jsonb)
      )
      FROM exams e
      LEFT JOIN categories c ON c.id = e.category_id
      LEFT JOIN organizations o ON o.id = e.organization_id
      WHERE e.id = p_exam_id
    ) END AS item
  )
  SELECT jsonb_build_object(
    'payload_version', 1,
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'exam', (SELECT item FROM exam_meta),
    'candidate', jsonb_build_object('user_id', p_user_id),
    'performance', jsonb_build_object(
      'attempts_total', p.attempts_total,
      'passed', p.passed,
      'failed', p.failed,
      'avg_percent', p.avg_percent,
      'total_time_minutes', p.total_time_minutes,
      'answered_total', (SELECT count(*) FROM ans)
    ),
    'recent_attempts', COALESCE((SELECT items FROM recent), '[]'::jsonb),
    'subjects', COALESCE((SELECT items FROM subj), '[]'::jsonb),
    'weak_topics', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'category_id', id, 'subject_id', subject_id, 'name', name,
        'attempts', answered, 'correct_rate', correct_rate, 'last_attempt_at', last_at
      ) ORDER BY correct_rate ASC)
      FROM (SELECT * FROM topics WHERE correct_rate < 70 ORDER BY correct_rate ASC LIMIT 8) w
    ), '[]'::jsonb),
    'strongest_topics', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'category_id', id, 'subject_id', subject_id, 'name', name,
        'attempts', answered, 'correct_rate', correct_rate, 'last_attempt_at', last_at
      ) ORDER BY correct_rate DESC)
      FROM (SELECT * FROM topics WHERE correct_rate >= 80 ORDER BY correct_rate DESC LIMIT 8) s
    ), '[]'::jsonb),
    'difficulty', COALESCE((SELECT items FROM diff), '[]'::jsonb),
    'timing', jsonb_build_object(
      'available', false,
      'reason', 'no_per_question_duration_column',
      'total_time_minutes', (SELECT total_time_minutes FROM perf)
    )
  ) INTO v_result
  FROM perf p;

  RETURN v_result;
END;
$function$;

ALTER TABLE public.practice_sessions
  ADD COLUMN IF NOT EXISTS exam_id uuid REFERENCES public.exams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_practice_sessions_exam
  ON public.practice_sessions (user_id, exam_id, created_at DESC);

DROP FUNCTION IF EXISTS public.list_practice_questions(uuid, uuid, text, uuid, text, integer, integer);
CREATE OR REPLACE FUNCTION public.list_practice_questions(
  p_category_id uuid DEFAULT NULL,
  p_subject_id uuid DEFAULT NULL,
  p_difficulty text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_exam_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
  v_items jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT count(*) INTO v_total
  FROM public.questions q
  WHERE q.status = 'active'
    AND (p_category_id IS NULL OR q.category_id = p_category_id)
    AND (p_subject_id IS NULL OR q.subject_id = p_subject_id)
    AND (p_difficulty IS NULL OR q.difficulty = p_difficulty)
    AND (p_search IS NULL OR q.question_text ILIKE '%' || p_search || '%')
    AND (p_exam_id IS NULL OR EXISTS (
          SELECT 1 FROM public.exam_questions eq
          WHERE eq.question_id = q.id AND eq.exam_id = p_exam_id))
    AND (p_organization_id IS NULL OR EXISTS (
          SELECT 1 FROM public.exam_questions eq
          JOIN public.exams e ON e.id = eq.exam_id
          WHERE eq.question_id = q.id AND e.organization_id = p_organization_id));

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
      AND (p_exam_id IS NULL OR EXISTS (
            SELECT 1 FROM public.exam_questions eq
            WHERE eq.question_id = q.id AND eq.exam_id = p_exam_id))
      AND (p_organization_id IS NULL OR EXISTS (
            SELECT 1 FROM public.exam_questions eq
            JOIN public.exams e ON e.id = eq.exam_id
            WHERE eq.question_id = q.id AND e.organization_id = p_organization_id))
    ORDER BY q.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) s;

  RETURN jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'items', v_items);
END;
$function$;

DROP FUNCTION IF EXISTS public.start_practice_session(uuid[], uuid, uuid, text, integer);
CREATE OR REPLACE FUNCTION public.start_practice_session(
  p_subject_ids uuid[] DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_difficulty text DEFAULT NULL,
  p_count integer DEFAULT 10,
  p_exam_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer := least(greatest(coalesce(p_count, 10), 1), 60);
  v_ids uuid[];
  v_session uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  IF p_exam_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.exams e WHERE e.id = p_exam_id) THEN
    RAISE EXCEPTION 'exam not found';
  END IF;

  SELECT array_agg(id) INTO v_ids FROM (
    SELECT q.id FROM public.questions q
    WHERE q.status = 'active'
      AND EXISTS (SELECT 1 FROM public.question_options o WHERE o.question_id = q.id AND o.is_correct)
      AND (p_subject_ids IS NULL OR array_length(p_subject_ids,1) IS NULL OR q.subject_id = ANY(p_subject_ids))
      AND (p_category_id IS NULL OR q.category_id = p_category_id)
      AND (p_difficulty IS NULL OR q.difficulty = p_difficulty)
      AND (p_exam_id IS NULL OR EXISTS (
            SELECT 1 FROM public.exam_questions eq
            WHERE eq.question_id = q.id AND eq.exam_id = p_exam_id))
      AND (p_organization_id IS NULL OR EXISTS (
            SELECT 1 FROM public.exam_questions eq JOIN public.exams e ON e.id = eq.exam_id
            WHERE eq.question_id = q.id AND e.organization_id = p_organization_id))
    ORDER BY random() LIMIT v_count
  ) t;

  IF v_ids IS NULL OR array_length(v_ids,1) IS NULL THEN
    IF p_exam_id IS NOT NULL THEN
      RAISE EXCEPTION 'no_questions_for_exam';
    END IF;
    RAISE EXCEPTION 'no_questions';
  END IF;

  INSERT INTO public.practice_sessions (user_id, subject_ids, category_id, organization_id, difficulty, question_ids, exam_id)
  VALUES (v_uid, coalesce(p_subject_ids, '{}'), p_category_id, p_organization_id, p_difficulty, v_ids, p_exam_id)
  RETURNING id INTO v_session;

  RETURN v_session;
END;
$function$;

DROP FUNCTION IF EXISTS public.list_practice_sessions(integer);
CREATE OR REPLACE FUNCTION public.list_practice_sessions(p_limit integer DEFAULT 20, p_exam_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(x ORDER BY created_at DESC), '[]'::jsonb) FROM (
    SELECT s.created_at, jsonb_build_object(
      'id', s.id, 'status', s.status, 'created_at', s.created_at,
      'correct_count', s.correct_count, 'incorrect_count', s.incorrect_count,
      'exam_id', s.exam_id,
      'exam_title', (SELECT e.title FROM public.exams e WHERE e.id = s.exam_id),
      'total', coalesce(array_length(s.question_ids,1),0)) AS x
    FROM public.practice_sessions s
    WHERE s.user_id = auth.uid()
      AND (p_exam_id IS NULL OR s.exam_id = p_exam_id)
    ORDER BY s.created_at DESC
    LIMIT least(greatest(coalesce(p_limit,20),1),100)
  ) t;
$function$;

CREATE OR REPLACE FUNCTION public.get_practice_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    'exam_id', v_s.exam_id,
    'exam_title', (SELECT e.title FROM public.exams e WHERE e.id = v_s.exam_id),
    'exam_slug', (SELECT e.slug FROM public.exams e WHERE e.id = v_s.exam_id),
    'correct_count', v_s.correct_count, 'incorrect_count', v_s.incorrect_count,
    'total', coalesce(array_length(v_s.question_ids,1), 0),
    'questions', v_questions);
END;
$function$;

CREATE OR REPLACE FUNCTION public.practice_filters()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'categories', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.display_order, c.name)
        FROM public.categories c WHERE c.status = 'active'), '[]'::jsonb),
    'subjects', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.display_order, s.name)
        FROM public.subjects s WHERE s.status = 'active'), '[]'::jsonb),
    'organizations', coalesce((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) ORDER BY o.display_order, o.name)
        FROM public.organizations o WHERE o.status = 'active'), '[]'::jsonb),
    'exams', coalesce((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'name', e.title, 'slug', e.slug) ORDER BY e.title)
        FROM public.exams e WHERE e.status = 'published'), '[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION public.list_practice_questions(uuid, uuid, text, uuid, text, integer, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_practice_session(uuid[], uuid, uuid, text, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_practice_sessions(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_practice_questions(uuid, uuid, text, uuid, text, integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_practice_session(uuid[], uuid, uuid, text, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_practice_sessions(integer, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.__bootstrap_exec(text);
DROP SCHEMA IF EXISTS sandbox_boot CASCADE;