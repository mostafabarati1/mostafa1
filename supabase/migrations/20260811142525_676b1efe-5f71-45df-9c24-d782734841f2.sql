-- 1) Verified educational resource catalog (empty for now)
CREATE TABLE IF NOT EXISTS public.learning_resources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('book','course','article','video','practice')),
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  topic text,
  url text NOT NULL,
  language text NOT NULL DEFAULT 'fa',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_resources TO authenticated;
GRANT ALL ON public.learning_resources TO service_role;

ALTER TABLE public.learning_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "learning_resources_select_active" ON public.learning_resources;
CREATE POLICY "learning_resources_select_active"
  ON public.learning_resources FOR SELECT TO authenticated
  USING (is_active OR public.is_admin());

DROP POLICY IF EXISTS "learning_resources_admin_write" ON public.learning_resources;
CREATE POLICY "learning_resources_admin_write"
  ON public.learning_resources FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS learning_resources_set_updated_at ON public.learning_resources;
CREATE TRIGGER learning_resources_set_updated_at
  BEFORE UPDATE ON public.learning_resources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS learning_resources_subject_idx ON public.learning_resources(subject_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS learning_resources_category_idx ON public.learning_resources(category_id) WHERE is_active;

-- 2) Core sanitized analytics payload builder (internal)
CREATE OR REPLACE FUNCTION public.build_candidate_analytics(
  p_user_id uuid,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_exam_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
      SELECT category_id, max(subject_id) AS subject_id, count(*) AS answered,
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
$$;

REVOKE ALL ON FUNCTION public.build_candidate_analytics(uuid, date, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_candidate_analytics(uuid, date, date, uuid) TO service_role;

-- 3) Candidate self analytics
CREATE OR REPLACE FUNCTION public.candidate_analytics_self(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN public.build_candidate_analytics(auth.uid(), p_from, p_to, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.candidate_analytics_self(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.candidate_analytics_self(date, date) TO authenticated, service_role;

-- 4) Admin candidate analytics
CREATE OR REPLACE FUNCTION public.candidate_analytics_summary(p_user_id uuid, p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN public.build_candidate_analytics(p_user_id, p_from, p_to, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.candidate_analytics_summary(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.candidate_analytics_summary(uuid, date, date) TO authenticated, service_role;

-- 5) Admin exam-scoped candidate analytics
CREATE OR REPLACE FUNCTION public.exam_candidate_analytics(p_exam_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN public.build_candidate_analytics(p_user_id, NULL, NULL, p_exam_id);
END;
$$;
REVOKE ALL ON FUNCTION public.exam_candidate_analytics(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_candidate_analytics(uuid, uuid) TO authenticated, service_role;

-- 6) Weak topics
CREATE OR REPLACE FUNCTION public.weak_topics_for_user(p_user_id uuid DEFAULT NULL, p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
        SELECT q.category_id, max(q.subject_id) AS subject_id, count(*) AS answered,
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
$$;
REVOKE ALL ON FUNCTION public.weak_topics_for_user(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.weak_topics_for_user(uuid, integer) TO authenticated, service_role;

-- 7) Attempts timeline
CREATE OR REPLACE FUNCTION public.attempts_timeline(p_user_id uuid DEFAULT NULL, p_limit integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF v_uid <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY ord) FROM (
      SELECT a.submitted_at AS ord, jsonb_build_object(
        'attempt_id', a.id, 'exam_id', a.exam_id, 'exam_title', e.title,
        'submitted_at', a.submitted_at, 'passed', a.passed,
        'percent', CASE WHEN a.total_score > 0 THEN round(a.earned_score / a.total_score * 100, 1) ELSE 0 END
      ) AS x
      FROM exam_attempts a JOIN exams e ON e.id = a.exam_id
      WHERE a.candidate_id = v_uid AND a.submitted_at IS NOT NULL
      ORDER BY a.submitted_at DESC LIMIT p_limit
    ) t
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.attempts_timeline(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attempts_timeline(uuid, integer) TO authenticated, service_role;

-- 8) Difficulty stats
CREATE OR REPLACE FUNCTION public.question_difficulty_stats(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF v_uid <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'difficulty', d.difficulty, 'answered', d.answered,
      'correct_rate', d.correct_rate, 'avg_score_awarded', d.avg_score
    ) ORDER BY d.difficulty)
    FROM (
      SELECT q.difficulty, count(*) AS answered,
             round(avg(CASE WHEN aa.is_correct THEN 100.0 ELSE 0 END)::numeric, 1) AS correct_rate,
             round(avg(aa.score_awarded)::numeric, 2) AS avg_score
      FROM attempt_answers aa
      JOIN exam_attempts a ON a.id = aa.attempt_id AND a.candidate_id = v_uid AND a.submitted_at IS NOT NULL
      JOIN questions q ON q.id = aa.question_id
      GROUP BY q.difficulty
    ) d
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.question_difficulty_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.question_difficulty_stats(uuid) TO authenticated, service_role;

-- 9) Admin overview
CREATE OR REPLACE FUNCTION public.admin_analytics_overview()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'candidates_total', (SELECT count(*) FROM profiles),
    'exams_total', (SELECT count(*) FROM exams),
    'attempts_total', (SELECT count(*) FROM exam_attempts),
    'attempts_graded', (SELECT count(*) FROM exam_attempts WHERE submitted_at IS NOT NULL),
    'pass_rate', (SELECT round(avg(CASE WHEN passed THEN 100.0 ELSE 0 END)::numeric, 1)
                    FROM exam_attempts WHERE submitted_at IS NOT NULL),
    'avg_percent', (SELECT round(avg(CASE WHEN total_score > 0 THEN earned_score / total_score * 100 ELSE 0 END)::numeric, 1)
                    FROM exam_attempts WHERE submitted_at IS NOT NULL)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_analytics_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_analytics_overview() TO authenticated, service_role;

-- 10) Verified resource lookup (anti-hallucination source)
CREATE OR REPLACE FUNCTION public.resources_for_topics(
  p_subject_ids uuid[] DEFAULT NULL,
  p_category_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 12
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'title', r.title, 'type', r.resource_type,
      'topic', COALESCE(r.topic, s.name, c.name),
      'subject_id', r.subject_id, 'category_id', r.category_id,
      'url', r.url, 'language', r.language, 'description', r.description
    ) ORDER BY r.display_order, r.title)
    FROM (
      SELECT * FROM learning_resources
      WHERE is_active
        AND (
          (p_subject_ids IS NULL AND p_category_ids IS NULL)
          OR (p_subject_ids IS NOT NULL AND subject_id = ANY(p_subject_ids))
          OR (p_category_ids IS NOT NULL AND category_id = ANY(p_category_ids))
        )
      ORDER BY display_order, title
      LIMIT p_limit
    ) r
    LEFT JOIN subjects s ON s.id = r.subject_id
    LEFT JOIN categories c ON c.id = r.category_id
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.resources_for_topics(uuid[], uuid[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resources_for_topics(uuid[], uuid[], integer) TO authenticated, service_role;