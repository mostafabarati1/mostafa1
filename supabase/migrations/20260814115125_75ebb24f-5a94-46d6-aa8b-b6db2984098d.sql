CREATE OR REPLACE FUNCTION public.practice_filters()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'categories', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.display_order, c.name)
        FROM public.categories c WHERE c.status = 'active'), '[]'::jsonb),
    'subjects', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.display_order, s.name)
        FROM public.subjects s WHERE s.status = 'active'), '[]'::jsonb),
    'organizations', coalesce((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) ORDER BY o.name)
        FROM public.organizations o WHERE o.status = 'active'), '[]'::jsonb),
    'exams', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', e.id,
          'name', e.title,
          'slug', e.slug,
          'subject_ids', coalesce((
            SELECT jsonb_agg(DISTINCT sid) FROM (
              SELECT es.subject_id AS sid FROM public.exam_subjects es WHERE es.exam_id = e.id AND es.subject_id IS NOT NULL
              UNION
              SELECT q.subject_id FROM public.exam_questions eq
                JOIN public.questions q ON q.id = eq.question_id
               WHERE eq.exam_id = e.id AND q.subject_id IS NOT NULL
            ) t
          ), '[]'::jsonb)
        ) ORDER BY e.title)
        FROM public.exams e WHERE e.status = 'published'), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.practice_filters() TO anon, authenticated, service_role;