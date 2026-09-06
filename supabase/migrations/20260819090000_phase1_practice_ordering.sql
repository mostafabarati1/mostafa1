CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_display_order
  ON public.exam_questions (exam_id, display_order NULLS LAST, id);

CREATE OR REPLACE FUNCTION public.list_practice_questions(p_category_id uuid DEFAULT NULL::uuid, p_subject_id uuid DEFAULT NULL::uuid, p_difficulty text DEFAULT NULL::text, p_organization_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_exam_id uuid DEFAULT NULL::uuid, p_subject_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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

  SELECT coalesce(jsonb_agg(item ORDER BY ord_display ASC NULLS LAST, ord_id ASC), '[]'::jsonb) INTO v_items
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
    ) AS item,
    (SELECT min(eq.display_order) FROM public.exam_questions eq
       WHERE eq.question_id = q.id
         AND (p_exam_id IS NULL OR eq.exam_id = p_exam_id)) AS ord_display,
    q.id AS ord_id
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
    ORDER BY ord_display ASC NULLS LAST, q.id ASC
    LIMIT v_limit OFFSET v_offset
  ) s;

  RETURN jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'items', v_items);
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_practice_session(p_subject_ids uuid[] DEFAULT NULL::uuid[], p_category_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_difficulty text DEFAULT NULL::text, p_count integer DEFAULT 10, p_exam_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  SELECT array_agg(id ORDER BY ord_display ASC NULLS LAST, id ASC) INTO v_ids FROM (
    SELECT q.id,
      (SELECT min(eq.display_order) FROM public.exam_questions eq
         WHERE eq.question_id = q.id
           AND (p_exam_id IS NULL OR eq.exam_id = p_exam_id)) AS ord_display
    FROM public.questions q
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
    ORDER BY ord_display ASC NULLS LAST, q.id ASC
    LIMIT v_count
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

CREATE OR REPLACE FUNCTION public.create_organization_for_bulk_import(p_name text, p_slug text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := nullif(btrim(coalesce(p_slug, '')), '');
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  IF v_slug IS NULL THEN
    v_slug := regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g');
    v_slug := nullif(btrim(v_slug, '-'), '');
    IF v_slug IS NULL THEN
      v_slug := 'org-' || substr(md5(v_name), 1, 8);
    END IF;
  END IF;

  SELECT o.id INTO v_id FROM public.organizations o
   WHERE lower(o.name) = lower(v_name) OR o.slug = v_slug
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  BEGIN
    INSERT INTO public.organizations (name, slug) VALUES (v_name, v_slug) RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT o.id INTO v_id FROM public.organizations o
     WHERE lower(o.name) = lower(v_name) OR o.slug = v_slug
     LIMIT 1;
  END;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_organization_for_bulk_import(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_organization_for_bulk_import(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_organization_for_bulk_import(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_exam_subjects_question_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  v_ids := ARRAY(
    SELECT DISTINCT x FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.exam_subject_id END,
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.exam_subject_id END
    ]) AS x WHERE x IS NOT NULL
  );

  IF array_length(v_ids, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.exam_subjects es
     SET question_count = (
       SELECT count(*) FROM public.exam_questions eq WHERE eq.exam_subject_id = es.id
     )
   WHERE es.id = ANY(v_ids);

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_exam_questions_sync_count_ins ON public.exam_questions;
DROP TRIGGER IF EXISTS trg_exam_questions_sync_count_upd ON public.exam_questions;
DROP TRIGGER IF EXISTS trg_exam_questions_sync_count_del ON public.exam_questions;

CREATE TRIGGER trg_exam_questions_sync_count_ins
AFTER INSERT ON public.exam_questions
FOR EACH ROW EXECUTE FUNCTION public.sync_exam_subjects_question_count();

CREATE TRIGGER trg_exam_questions_sync_count_upd
AFTER UPDATE OF exam_subject_id ON public.exam_questions
FOR EACH ROW WHEN (OLD.exam_subject_id IS DISTINCT FROM NEW.exam_subject_id)
EXECUTE FUNCTION public.sync_exam_subjects_question_count();

CREATE TRIGGER trg_exam_questions_sync_count_del
AFTER DELETE ON public.exam_questions
FOR EACH ROW EXECUTE FUNCTION public.sync_exam_subjects_question_count();

UPDATE public.exam_subjects es
   SET question_count = (
     SELECT count(*) FROM public.exam_questions eq WHERE eq.exam_subject_id = es.id
   );
