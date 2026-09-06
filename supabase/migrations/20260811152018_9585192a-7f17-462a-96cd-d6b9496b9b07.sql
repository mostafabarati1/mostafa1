CREATE OR REPLACE FUNCTION public.admin_list_exams(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_access_type text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_size integer := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100);
  v_total integer;
  v_items jsonb;
  v_search text := NULLIF(BTRIM(COALESCE(p_search, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.exams e
  WHERE (v_search IS NULL OR e.title ILIKE '%' || v_search || '%' OR e.slug ILIKE '%' || v_search || '%')
    AND (p_status IS NULL OR e.status = p_status)
    AND (p_access_type IS NULL OR e.access_type = p_access_type)
    AND (p_category_id IS NULL OR e.category_id = p_category_id);

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.updated_at DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT e.id, e.title, e.slug, e.status, e.access_type, e.level, e.is_free, e.price,
           e.duration_minutes, e.year, e.period, e.round, e.created_at, e.updated_at,
           c.name AS category_name,
           o.name AS organization_name,
           (SELECT COUNT(*) FROM public.exam_questions q WHERE q.exam_id = e.id) AS question_count,
           (SELECT COUNT(*) FROM public.exam_attempts a WHERE a.exam_id = e.id) AS attempt_count
    FROM public.exams e
    LEFT JOIN public.categories c ON c.id = e.category_id
    LEFT JOIN public.organizations o ON o.id = e.organization_id
    WHERE (v_search IS NULL OR e.title ILIKE '%' || v_search || '%' OR e.slug ILIKE '%' || v_search || '%')
      AND (p_status IS NULL OR e.status = p_status)
      AND (p_access_type IS NULL OR e.access_type = p_access_type)
      AND (p_category_id IS NULL OR e.category_id = p_category_id)
    ORDER BY e.updated_at DESC
    LIMIT v_size OFFSET (v_page - 1) * v_size
  ) t;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', COALESCE(v_total, 0),
    'page', v_page,
    'page_size', v_size
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_exams(text, text, text, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_exams(text, text, text, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_exams(text, text, text, uuid, integer, integer) TO service_role;