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

  SELECT count(*) INTO v_total
  FROM public.questions q
  WHERE q.status = 'active'
    AND (p_category_id IS NULL OR q.category_id = p_category_id)
    AND (p_subject_id IS NULL OR q.subject_id = p_subject_id)
    AND (p_difficulty IS NULL OR q.difficulty = p_difficulty)
    AND (p_search IS NULL OR q.question_text ILIKE '%' || p_search || '%')
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
      AND (p_organization_id IS NULL OR EXISTS (
            SELECT 1 FROM public.exam_questions eq
            JOIN public.exams e ON e.id = eq.exam_id
            WHERE eq.question_id = q.id AND e.organization_id = p_organization_id))
    ORDER BY q.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) s;

  RETURN jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'items', v_items);
END; $$;