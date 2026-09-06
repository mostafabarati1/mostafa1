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
    'subjects', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'exam_subject_id', es.id, 'subject_id', s.id, 'name', s.name,
        'coefficient', es.coefficient, 'question_count', es.question_count,
        'time_limit_minutes', es.time_limit_minutes,
        'negative_marking', es.negative_marking, 'display_order', es.display_order)
      ORDER BY es.display_order, s.name)
      FROM public.exam_subjects es JOIN public.subjects s ON s.id = es.subject_id
      WHERE es.exam_id = a.exam_id), '[]'::jsonb),
    'questions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'question_id', q.id, 'question_text', q.question_text, 'score', eq.score,
        'display_order', eq.display_order,
        'exam_subject_id', es.id,
        'subject_id', COALESCE(es.subject_id, q.subject_id),
        'subject_name', sj.name,
        'selected_option_id', (SELECT aa.selected_option_id FROM public.attempt_answers aa
                               WHERE aa.attempt_id = a.id AND aa.question_id = q.id),
        'options', (SELECT jsonb_agg(jsonb_build_object('id',qo.id,'option_text',qo.option_text)
                    ORDER BY CASE WHEN e.randomize_options THEN NULL ELSE qo.display_order END, qo.id)
                    FROM public.question_options qo WHERE qo.question_id = q.id))
      ORDER BY COALESCE(es.display_order, 9999),
               CASE WHEN e.randomize_questions THEN NULL ELSE eq.display_order END, eq.id)
      FROM public.exam_questions eq
      JOIN public.questions q ON q.id = eq.question_id
      LEFT JOIN public.exam_subjects es ON es.id = eq.exam_subject_id
      LEFT JOIN public.subjects sj ON sj.id = COALESCE(es.subject_id, q.subject_id)
      WHERE eq.exam_id = a.exam_id
        AND (a.category_ids IS NULL OR array_length(a.category_ids,1) IS NULL OR q.category_id = ANY(a.category_ids))
      ), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.attempt_per_subject(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.exam_attempts; r jsonb;
BEGIN
  SELECT * INTO a FROM public.exam_attempts WHERE id = p_attempt_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'attempt not found'; END IF;
  IF a.candidate_id <> auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'subject_id', t.subject_id, 'name', COALESCE(t.name, 'سایر'),
      'coefficient', COALESCE(t.coefficient, 1),
      'question_count', t.q_count,
      'correct_count', t.correct_count,
      'incorrect_count', t.incorrect_count,
      'unanswered_count', t.q_count - t.correct_count - t.incorrect_count,
      'earned_score', t.earned_score,
      'total_score', t.total_score,
      'percentage', CASE WHEN t.total_score > 0
                         THEN round(GREATEST(t.earned_score,0) / t.total_score * 100, 1) ELSE 0 END)
    ORDER BY COALESCE(t.display_order, 9999), COALESCE(t.name,'')), '[]'::jsonb) INTO r
  FROM (
    SELECT COALESCE(es.subject_id, q.subject_id) AS subject_id,
           sj.name AS name, es.coefficient AS coefficient, es.display_order AS display_order,
           count(*)::int AS q_count,
           count(*) FILTER (WHERE aa.is_correct)::int AS correct_count,
           count(*) FILTER (WHERE aa.selected_option_id IS NOT NULL AND NOT COALESCE(aa.is_correct,false))::int AS incorrect_count,
           COALESCE(sum(aa.score_awarded), 0) AS earned_score,
           COALESCE(sum(eq.score * COALESCE(es.coefficient,1)), 0) AS total_score
    FROM public.exam_questions eq
    JOIN public.questions q ON q.id = eq.question_id
    LEFT JOIN public.exam_subjects es ON es.id = eq.exam_subject_id
    LEFT JOIN public.subjects sj ON sj.id = COALESCE(es.subject_id, q.subject_id)
    LEFT JOIN public.attempt_answers aa ON aa.attempt_id = a.id AND aa.question_id = q.id
    WHERE eq.exam_id = a.exam_id
      AND (a.category_ids IS NULL OR array_length(a.category_ids,1) IS NULL OR q.category_id = ANY(a.category_ids))
    GROUP BY COALESCE(es.subject_id, q.subject_id), sj.name, es.coefficient, es.display_order
  ) t;
  RETURN r;
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
      score_awarded = CASE
        WHEN COALESCE(qo.is_correct,false) THEN w.weighted
        WHEN COALESCE(w.negative_marking,false) THEN -1 * (w.weighted / 3.0)
        ELSE 0 END
  FROM public.question_options qo,
       LATERAL (
         SELECT COALESCE(eq.score,1) * COALESCE(es.coefficient,1) AS weighted,
                es.negative_marking AS negative_marking
         FROM public.exam_questions eq
         LEFT JOIN public.exam_subjects es ON es.id = eq.exam_subject_id
         WHERE eq.exam_id = a.exam_id AND eq.question_id = aa.question_id
         LIMIT 1
       ) w
  WHERE aa.attempt_id = a.id AND qo.id = aa.selected_option_id;

  UPDATE public.attempt_answers SET is_correct = false, score_awarded = 0
  WHERE attempt_id = a.id AND selected_option_id IS NULL;

  SELECT COALESCE(sum(eq.score * COALESCE(es.coefficient,1)),0) INTO v_total
  FROM public.exam_questions eq
  JOIN public.questions q ON q.id = eq.question_id
  LEFT JOIN public.exam_subjects es ON es.id = eq.exam_subject_id
  WHERE eq.exam_id = a.exam_id
    AND (a.category_ids IS NULL OR array_length(a.category_ids,1) IS NULL OR q.category_id = ANY(a.category_ids));

  SELECT count(*) FILTER (WHERE is_correct), count(*) FILTER (WHERE NOT is_correct AND selected_option_id IS NOT NULL),
         COALESCE(sum(score_awarded),0)
  INTO v_correct, v_incorrect, v_earned
  FROM public.attempt_answers WHERE attempt_id = a.id;

  v_earned := GREATEST(v_earned, 0);

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
    'total_score', v_total, 'earned_score', v_earned, 'percentage', round(v_pct,2),
    'passed', v_passed, 'per_subject', public.attempt_per_subject(a.id));
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
    'per_subject', public.attempt_per_subject(a.id),
    'questions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'question_id', q.id, 'question_text', q.question_text, 'score', eq.score,
        'exam_subject_id', es.id,
        'subject_id', COALESCE(es.subject_id, q.subject_id),
        'subject_name', sj.name,
        'selected_option_id', aa.selected_option_id, 'is_correct', aa.is_correct,
        'score_awarded', aa.score_awarded,
        'explanation', (SELECT x.explanation FROM public.ai_explanations x WHERE x.question_id = q.id),
        'options', (SELECT jsonb_agg(jsonb_build_object('id',qo.id,'option_text',qo.option_text,'is_correct',qo.is_correct)
                    ORDER BY qo.display_order) FROM public.question_options qo WHERE qo.question_id = q.id))
      ORDER BY COALESCE(es.display_order, 9999), eq.display_order)
      FROM public.exam_questions eq
      JOIN public.questions q ON q.id = eq.question_id
      LEFT JOIN public.exam_subjects es ON es.id = eq.exam_subject_id
      LEFT JOIN public.subjects sj ON sj.id = COALESCE(es.subject_id, q.subject_id)
      LEFT JOIN public.attempt_answers aa ON aa.attempt_id = a.id AND aa.question_id = q.id
      WHERE eq.exam_id = a.exam_id
        AND (a.category_ids IS NULL OR array_length(a.category_ids,1) IS NULL OR q.category_id = ANY(a.category_ids))
      ), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END; $$;

REVOKE ALL ON FUNCTION public.attempt_per_subject(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attempt_per_subject(uuid) TO authenticated, service_role;