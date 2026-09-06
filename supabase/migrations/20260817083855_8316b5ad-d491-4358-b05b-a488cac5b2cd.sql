-- Unify subject-filter logic for practice across all entry points.

-- 1) Precise subject mapping for a question (no exam-wide fan-out).
CREATE OR REPLACE FUNCTION public.question_subject_ids(_question_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT sid), '{}'::uuid[])
  FROM (
    SELECT q.subject_id AS sid
    FROM public.questions q
    WHERE q.id = _question_id AND q.subject_id IS NOT NULL
    UNION
    SELECT es.subject_id
    FROM public.exam_questions eq
    JOIN public.exam_subjects es ON es.id = eq.exam_subject_id
    WHERE eq.question_id = _question_id AND es.subject_id IS NOT NULL
  ) t
  WHERE sid IS NOT NULL;
$$;

-- 2) Single source of truth for "does this question match the selected subjects?"
CREATE OR REPLACE FUNCTION public.question_matches_subjects(_question_id uuid, _subject_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _subject_ids IS NULL
      OR array_length(_subject_ids, 1) IS NULL
      OR public.question_subject_ids(_question_id) && _subject_ids;
$$;

REVOKE ALL ON FUNCTION public.question_subject_ids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.question_matches_subjects(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.question_subject_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.question_matches_subjects(uuid, uuid[]) TO authenticated, service_role;

-- 3) Practice listing: accept multi-subject selection, use the shared matcher.
DROP FUNCTION IF EXISTS public.list_practice_questions(uuid, uuid, text, uuid, text, integer, integer, uuid);

CREATE OR REPLACE FUNCTION public.list_practice_questions(
  p_category_id uuid DEFAULT NULL,
  p_subject_id uuid DEFAULT NULL,
  p_difficulty text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_exam_id uuid DEFAULT NULL,
  p_subject_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_subjects uuid[];
  v_total bigint;
  v_items jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  v_subjects := coalesce(
    nullif(p_subject_ids, '{}'::uuid[]),
    CASE WHEN p_subject_id IS NULL THEN NULL ELSE ARRAY[p_subject_id] END
  );

  SELECT count(*) INTO v_total
  FROM public.questions q
  WHERE q.status = 'active'
    AND (p_category_id IS NULL OR q.category_id = p_category_id)
    AND public.question_matches_subjects(q.id, v_subjects)
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
      'subject', (SELECT s.name FROM public.subjects s
                  WHERE s.id = coalesce(q.subject_id, (public.question_subject_ids(q.id))[1])),
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
      AND public.question_matches_subjects(q.id, v_subjects)
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

REVOKE ALL ON FUNCTION public.list_practice_questions(uuid, uuid, text, uuid, text, integer, integer, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_practice_questions(uuid, uuid, text, uuid, text, integer, integer, uuid, uuid[]) TO authenticated, service_role;

-- 4) Session creation uses the same matcher.
CREATE OR REPLACE FUNCTION public.start_practice_session(
  p_subject_ids uuid[] DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_difficulty text DEFAULT NULL,
  p_count integer DEFAULT 10,
  p_exam_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer := least(greatest(coalesce(p_count, 10), 1), 60);
  v_subjects uuid[] := nullif(p_subject_ids, '{}'::uuid[]);
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
      AND public.question_matches_subjects(q.id, v_subjects)
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
    IF v_subjects IS NOT NULL THEN
      RAISE EXCEPTION 'no_questions_for_subject';
    END IF;
    IF p_exam_id IS NOT NULL THEN
      RAISE EXCEPTION 'no_questions_for_exam';
    END IF;
    RAISE EXCEPTION 'no_questions';
  END IF;

  INSERT INTO public.practice_sessions (user_id, subject_ids, category_id, organization_id, difficulty, question_ids, exam_id)
  VALUES (v_uid, coalesce(v_subjects, '{}'), p_category_id, p_organization_id, p_difficulty, v_ids, p_exam_id)
  RETURNING id INTO v_session;

  RETURN v_session;
END;
$function$;

-- 5) Filters only advertise subjects that actually have practiceable questions.
CREATE OR REPLACE FUNCTION public.practice_filters()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
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
            SELECT jsonb_agg(DISTINCT sid)
            FROM public.exam_questions eq
            JOIN public.questions q ON q.id = eq.question_id AND q.status = 'active'
            CROSS JOIN LATERAL unnest(public.question_subject_ids(q.id)) AS u(sid)
            JOIN public.subjects s ON s.id = u.sid AND s.status = 'active'
            WHERE eq.exam_id = e.id
          ), '[]'::jsonb)
        ) ORDER BY e.title)
        FROM public.exams e WHERE e.status = 'published'), '[]'::jsonb)
  );
$function$;