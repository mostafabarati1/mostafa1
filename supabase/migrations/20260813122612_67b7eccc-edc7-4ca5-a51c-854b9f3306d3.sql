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
        WHEN COALESCE(qo.is_correct,false) THEN COALESCE((
          SELECT COALESCE(eq.score,1) * COALESCE(es.coefficient,1)
          FROM public.exam_questions eq
          LEFT JOIN public.exam_subjects es ON es.id = eq.exam_subject_id
          WHERE eq.exam_id = a.exam_id AND eq.question_id = aa.question_id
          LIMIT 1), 1)
        WHEN COALESCE((
          SELECT es.negative_marking
          FROM public.exam_questions eq
          LEFT JOIN public.exam_subjects es ON es.id = eq.exam_subject_id
          WHERE eq.exam_id = a.exam_id AND eq.question_id = aa.question_id
          LIMIT 1), false)
        THEN -1 * (COALESCE((
          SELECT COALESCE(eq.score,1) * COALESCE(es.coefficient,1)
          FROM public.exam_questions eq
          LEFT JOIN public.exam_subjects es ON es.id = eq.exam_subject_id
          WHERE eq.exam_id = a.exam_id AND eq.question_id = aa.question_id
          LIMIT 1), 1) / 3.0)
        ELSE 0 END
  FROM public.question_options qo
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