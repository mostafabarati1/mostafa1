
-- helper: effective subjects of a question (own subject + subjects of exams it belongs to)
CREATE OR REPLACE FUNCTION public.question_subject_ids(_question_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(array_agg(DISTINCT sid), '{}'::uuid[])
  FROM (
    SELECT q.subject_id AS sid FROM public.questions q WHERE q.id = _question_id AND q.subject_id IS NOT NULL
    UNION
    SELECT es.subject_id
    FROM public.exam_questions eq
    JOIN public.exam_subjects es ON es.exam_id = eq.exam_id
      AND (eq.exam_subject_id IS NULL OR eq.exam_subject_id = es.id)
    WHERE eq.question_id = _question_id
  ) t
  WHERE sid IS NOT NULL;
$$;

-- backfill: question with no subject but belonging to exam(s) resolving to exactly one subject
UPDATE public.questions q
SET subject_id = s.sid
FROM (
  SELECT q2.id, (public.question_subject_ids(q2.id))[1] AS sid,
         array_length(public.question_subject_ids(q2.id), 1) AS n
  FROM public.questions q2
  WHERE q2.subject_id IS NULL
) s
WHERE q.id = s.id AND s.n = 1 AND s.sid IS NOT NULL;

-- practice listing: match on effective subject
CREATE OR REPLACE FUNCTION public.list_practice_questions(p_category_id uuid DEFAULT NULL::uuid, p_subject_id uuid DEFAULT NULL::uuid, p_difficulty text DEFAULT NULL::text, p_organization_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_exam_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
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
    AND (p_subject_id IS NULL OR p_subject_id = ANY(public.question_subject_ids(q.id)))
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
      AND (p_subject_id IS NULL OR p_subject_id = ANY(public.question_subject_ids(q.id)))
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

-- practice session start: match on effective subject
CREATE OR REPLACE FUNCTION public.start_practice_session(p_subject_ids uuid[] DEFAULT NULL::uuid[], p_category_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_difficulty text DEFAULT NULL::text, p_count integer DEFAULT 10, p_exam_id uuid DEFAULT NULL::uuid)
RETURNS uuid
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
      AND (p_subject_ids IS NULL OR array_length(p_subject_ids,1) IS NULL
           OR public.question_subject_ids(q.id) && p_subject_ids)
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

GRANT EXECUTE ON FUNCTION public.question_subject_ids(uuid) TO authenticated, anon, service_role;
