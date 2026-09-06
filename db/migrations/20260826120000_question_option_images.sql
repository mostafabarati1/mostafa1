-- افزودن تصویر به گزینه‌های سوال (additive و غیرمخرب)
-- اجرا: این فایل باید به‌صورت دستی روی پروژه Supabase اعمال شود (supabase db push / SQL editor).

-- ۱) ستون تصویر گزینه
ALTER TABLE public.question_options
  ADD COLUMN IF NOT EXISTS image_url text;

-- ۲) باکت ذخیره تصاویر گزینه‌ها (خواندن عمومی، سقف ۵ مگابایت)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'question-media',
  'question-media',
  true,
  5242880,
  ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "question_media_public_read" ON storage.objects;
CREATE POLICY "question_media_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'question-media');

DROP POLICY IF EXISTS "question_media_admin_insert" ON storage.objects;
CREATE POLICY "question_media_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'question-media' AND public.is_admin());

DROP POLICY IF EXISTS "question_media_admin_update" ON storage.objects;
CREATE POLICY "question_media_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'question-media' AND public.is_admin())
  WITH CHECK (bucket_id = 'question-media' AND public.is_admin());

DROP POLICY IF EXISTS "question_media_admin_delete" ON storage.objects;
CREATE POLICY "question_media_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'question-media' AND public.is_admin());

-- ۳) ذخیره سوال با پشتیبانی از تصویر گزینه (کلیدهای قبلی حفظ شده‌اند)
CREATE OR REPLACE FUNCTION public.save_question(p_id uuid, p_text text, p_difficulty text, p_status text,
  p_category_id uuid, p_score numeric, p_options jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; o jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.questions(question_text, difficulty, status, category_id, default_score, created_by)
    VALUES (p_text, COALESCE(p_difficulty,'medium'), COALESCE(p_status,'active'), p_category_id, COALESCE(p_score,1), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.questions SET question_text=p_text, difficulty=COALESCE(p_difficulty,'medium'),
      status=COALESCE(p_status,'active'), category_id=p_category_id, default_score=COALESCE(p_score,1)
    WHERE id=p_id RETURNING id INTO v_id;
  END IF;
  IF p_options IS NOT NULL THEN
    DELETE FROM public.question_options WHERE question_id = v_id;
    FOR o IN SELECT * FROM jsonb_array_elements(p_options) LOOP
      INSERT INTO public.question_options(question_id, option_text, is_correct, display_order, image_url)
      VALUES (v_id, COALESCE(o->>'text',''), COALESCE((o->>'is_correct')::boolean,false),
              COALESCE((o->>'order')::int,0), NULLIF(o->>'image_url',''));
    END LOOP;
  END IF;
  RETURN v_id;
END; $$;

-- ۴) افزودن کلید image_url به خروجی توابع خواندن (کلیدهای فعلی دست‌نخورده)
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
        'options', (SELECT jsonb_agg(jsonb_build_object('id',qo.id,'option_text',qo.option_text,'image_url',qo.image_url)
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
        'options', (SELECT jsonb_agg(jsonb_build_object('id',qo.id,'option_text',qo.option_text,'is_correct',qo.is_correct,'image_url',qo.image_url)
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

CREATE OR REPLACE FUNCTION public.get_practice_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_s public.practice_sessions; v_questions jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO v_s FROM public.practice_sessions WHERE id = p_session_id;
  IF v_s.id IS NULL OR (v_s.user_id <> v_uid AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  SELECT coalesce(jsonb_agg(item ORDER BY ord), '[]'::jsonb) INTO v_questions FROM (
    SELECT o.ord, jsonb_build_object(
      'id', q.id,
      'question_text', q.question_text,
      'difficulty', q.difficulty,
      'subject', (SELECT s.name FROM public.subjects s WHERE s.id = q.subject_id),
      'category', (SELECT c.name FROM public.categories c WHERE c.id = q.category_id),
      'options', coalesce((SELECT jsonb_agg(jsonb_build_object('id', op.id, 'option_text', op.option_text, 'is_correct', op.is_correct, 'image_url', op.image_url)
            ORDER BY op.display_order, op.id) FROM public.question_options op WHERE op.question_id = q.id), '[]'::jsonb),
      'answer', (SELECT jsonb_build_object('selected_option_id', a.selected_option_id, 'is_correct', a.is_correct)
                 FROM public.practice_answers a WHERE a.session_id = v_s.id AND a.question_id = q.id),
      'has_explanation', EXISTS (SELECT 1 FROM public.ai_explanations x WHERE x.question_id = q.id
            AND x.explanation IS NOT NULL AND x.content_checksum IS NOT DISTINCT FROM public.question_checksum(q.id))
    ) AS item
    FROM unnest(v_s.question_ids) WITH ORDINALITY AS o(qid, ord)
    JOIN public.questions q ON q.id = o.qid
  ) t;

  RETURN jsonb_build_object(
    'id', v_s.id, 'status', v_s.status, 'created_at', v_s.created_at,
    'finished_at', v_s.finished_at, 'difficulty', v_s.difficulty,
    'exam_id', v_s.exam_id,
    'exam_title', (SELECT e.title FROM public.exams e WHERE e.id = v_s.exam_id),
    'exam_slug', (SELECT e.slug FROM public.exams e WHERE e.id = v_s.exam_id),
    'correct_count', v_s.correct_count, 'incorrect_count', v_s.incorrect_count,
    'total', coalesce(array_length(v_s.question_ids,1), 0),
    'questions', v_questions);
END;
$function$;

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
        SELECT jsonb_agg(jsonb_build_object('id', o.id, 'option_text', o.option_text, 'is_correct', o.is_correct, 'image_url', o.image_url)
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
