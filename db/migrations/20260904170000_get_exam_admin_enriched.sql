-- Enrich get_exam_admin with related table values (names, counts, timestamps)
-- so the admin exam form can display exact Supabase values.

CREATE OR REPLACE FUNCTION public.get_exam_admin(p_exam_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    'created_at', e.created_at, 'updated_at', e.updated_at,
    'category_name', (SELECT c.name FROM public.categories c WHERE c.id = e.category_id),
    'organization_name', (SELECT o.name FROM public.organizations o WHERE o.id = e.organization_id),
    'question_count', (SELECT count(*) FROM public.exam_questions eq WHERE eq.exam_id = e.id),
    'attempt_count', (SELECT count(*) FROM public.exam_attempts ea WHERE ea.exam_id = e.id),
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
END; $function$;
