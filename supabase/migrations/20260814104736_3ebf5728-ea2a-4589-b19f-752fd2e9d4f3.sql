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
             (array_agg(subject_id) FILTER (WHERE subject_id IS NOT NULL))[1] AS subject_id,
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
GRANT EXECUTE ON FUNCTION public.build_candidate_analytics(uuid, date, date, uuid) TO authenticated, service_role;