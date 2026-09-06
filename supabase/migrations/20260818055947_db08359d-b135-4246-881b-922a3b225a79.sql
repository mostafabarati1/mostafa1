CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS explanation text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS media jsonb;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS import_batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_questions_content_hash ON public.questions (content_hash);
CREATE INDEX IF NOT EXISTS idx_questions_import_batch ON public.questions (import_batch_id);

-- Normalization used for duplicate fingerprints
CREATE OR REPLACE FUNCTION public.normalize_for_hash(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(btrim(regexp_replace(
    replace(replace(replace(coalesce(p_text, ''), 'ي', 'ی'), 'ك', 'ک'), U&'\200C', ' '),
    '\s+', ' ', 'g')));
$$;

CREATE OR REPLACE FUNCTION public.question_content_hash(
  p_question_text text,
  p_options text[],
  p_difficulty text,
  p_category_id uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest(
    public.normalize_for_hash(p_question_text) || '||' ||
    coalesce((
      SELECT string_agg(public.normalize_for_hash(o), '|' ORDER BY public.normalize_for_hash(o))
      FROM unnest(coalesce(p_options, ARRAY[]::text[])) AS o
    ), '') || '||' ||
    coalesce(p_difficulty, '') || '||' || coalesce(p_category_id::text, ''),
    'sha256'), 'hex');
$$;

CREATE TABLE IF NOT EXISTS public.question_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  exam_id uuid REFERENCES public.exams(id) ON DELETE SET NULL,
  file_name text,
  file_type text,
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  error_report_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.question_import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.question_import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  field_name text,
  error_code text,
  error_message text,
  raw_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_import_errors_batch ON public.question_import_errors (batch_id);
CREATE INDEX IF NOT EXISTS idx_question_import_batches_creator ON public.question_import_batches (created_by, created_at DESC);

GRANT SELECT ON public.question_import_batches TO authenticated;
GRANT ALL ON public.question_import_batches TO service_role;
GRANT SELECT ON public.question_import_errors TO authenticated;
GRANT ALL ON public.question_import_errors TO service_role;

ALTER TABLE public.question_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_import_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS question_import_batches_select ON public.question_import_batches;
CREATE POLICY question_import_batches_select ON public.question_import_batches
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS question_import_errors_select ON public.question_import_errors;
CREATE POLICY question_import_errors_select ON public.question_import_errors
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.question_import_batches b
      WHERE b.id = question_import_errors.batch_id AND b.created_by = auth.uid()
    )
  );

-- 1) create batch
CREATE OR REPLACE FUNCTION public.admin_create_question_import_batch(
  p_exam_id uuid DEFAULT NULL,
  p_file_name text DEFAULT NULL,
  p_file_type text DEFAULT NULL,
  p_total_rows integer DEFAULT 0,
  p_valid_rows integer DEFAULT 0,
  p_invalid_rows integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید';
  END IF;

  INSERT INTO public.question_import_batches (
    created_by, exam_id, file_name, file_type, total_rows, valid_rows, invalid_rows, status
  ) VALUES (
    auth.uid(),
    p_exam_id,
    nullif(left(coalesce(p_file_name, ''), 300), ''),
    nullif(left(coalesce(p_file_type, ''), 50), ''),
    greatest(coalesce(p_total_rows, 0), 0),
    greatest(coalesce(p_valid_rows, 0), 0),
    greatest(coalesce(p_invalid_rows, 0), 0),
    'importing'
  )
  RETURNING id INTO v_id;

  PERFORM public.log_audit('question_import_batch', v_id, 'create',
    jsonb_build_object('file_name', p_file_name, 'file_type', p_file_type, 'total_rows', p_total_rows));

  RETURN v_id;
END;
$$;

-- 2) validate rows / duplicate detection
CREATE OR REPLACE FUNCTION public.admin_validate_question_import(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_hash text;
  v_options text[];
  v_existing uuid;
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'ورودی نامعتبر است';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    SELECT coalesce(array_agg(x), ARRAY[]::text[]) INTO v_options
    FROM jsonb_array_elements_text(coalesce(v_row -> 'options', '[]'::jsonb)) AS x;

    v_hash := public.question_content_hash(
      coalesce(v_row ->> 'question_text', ''),
      v_options,
      coalesce(v_row ->> 'difficulty', 'medium'),
      nullif(v_row ->> 'category_id', '')::uuid
    );

    SELECT q.id INTO v_existing
    FROM public.questions q
    WHERE q.content_hash = v_hash
    LIMIT 1;

    v_out := v_out || jsonb_build_object(
      'row_number', coalesce((v_row ->> 'row_number')::int, 0),
      'content_hash', v_hash,
      'is_duplicate', v_existing IS NOT NULL,
      'existing_question_id', v_existing
    );
    v_existing := NULL;
  END LOOP;

  RETURN v_out;
END;
$$;

-- 3) chunked import
CREATE OR REPLACE FUNCTION public.admin_import_questions(
  p_batch_id uuid,
  p_exam_id uuid,
  p_rows jsonb,
  p_chunk_number integer DEFAULT 1,
  p_is_last_chunk boolean DEFAULT true,
  p_duplicate_policy text DEFAULT 'skip',
  p_status text DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_options jsonb;
  v_option jsonb;
  v_option_texts text[];
  v_hash text;
  v_existing uuid;
  v_question_id uuid;
  v_exam_subject_id uuid;
  v_subject_id uuid;
  v_category_id uuid;
  v_row_number int;
  v_score numeric;
  v_difficulty text;
  v_next_order int;
  v_imported int := 0;
  v_duplicates int := 0;
  v_failed int := 0;
  v_batch public.question_import_batches%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید';
  END IF;

  SELECT * INTO v_batch FROM public.question_import_batches WHERE id = p_batch_id;
  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'دسته ورود اطلاعات یافت نشد';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'ورودی نامعتبر است';
  END IF;
  IF coalesce(p_duplicate_policy, 'skip') NOT IN ('skip', 'import_as_new', 'stop_on_duplicate') THEN
    RAISE EXCEPTION 'سیاست تکراری نامعتبر است';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_row_number := coalesce((v_row ->> 'row_number')::int, 0);
    BEGIN
      v_options := coalesce(v_row -> 'options', '[]'::jsonb);
      IF jsonb_array_length(v_options) < 2 THEN
        RAISE EXCEPTION 'حداقل دو گزینه لازم است';
      END IF;

      SELECT coalesce(array_agg(o ->> 'text'), ARRAY[]::text[]) INTO v_option_texts
      FROM jsonb_array_elements(v_options) AS o;

      v_category_id := nullif(v_row ->> 'category_id', '')::uuid;
      v_subject_id := nullif(v_row ->> 'subject_id', '')::uuid;
      v_difficulty := coalesce(nullif(v_row ->> 'difficulty', ''), 'medium');
      IF v_difficulty NOT IN ('easy', 'medium', 'hard') THEN
        RAISE EXCEPTION 'سطح سختی نامعتبر است';
      END IF;
      v_score := coalesce(nullif(v_row ->> 'score', '')::numeric, 1);
      IF v_score <= 0 THEN
        RAISE EXCEPTION 'نمره باید عددی مثبت باشد';
      END IF;
      IF coalesce(btrim(v_row ->> 'question_text'), '') = '' THEN
        RAISE EXCEPTION 'متن سوال خالی است';
      END IF;

      v_hash := public.question_content_hash(v_row ->> 'question_text', v_option_texts, v_difficulty, v_category_id);

      SELECT q.id INTO v_existing FROM public.questions q WHERE q.content_hash = v_hash LIMIT 1;

      IF v_existing IS NOT NULL AND p_duplicate_policy = 'stop_on_duplicate' THEN
        RAISE EXCEPTION 'سوال تکراری یافت شد و عملیات متوقف شد';
      END IF;

      IF v_existing IS NOT NULL AND p_duplicate_policy = 'skip' THEN
        v_duplicates := v_duplicates + 1;
        INSERT INTO public.question_import_errors (batch_id, row_number, field_name, error_code, error_message, raw_value)
        VALUES (p_batch_id, v_row_number, 'question_text', 'duplicate', 'سوال تکراری است و نادیده گرفته شد',
                left(coalesce(v_row ->> 'question_text', ''), 500));
        v_existing := NULL;
        CONTINUE;
      END IF;

      IF v_existing IS NOT NULL THEN
        v_duplicates := v_duplicates + 1;
      END IF;
      v_existing := NULL;

      INSERT INTO public.questions (
        question_text, default_score, difficulty, status, category_id, subject_id,
        created_by, explanation, content_hash, media, external_id, import_batch_id
      ) VALUES (
        btrim(v_row ->> 'question_text'),
        v_score,
        v_difficulty,
        CASE WHEN coalesce(p_status, 'active') IN ('active', 'draft', 'archived') THEN p_status ELSE 'active' END,
        v_category_id,
        v_subject_id,
        auth.uid(),
        nullif(btrim(coalesce(v_row ->> 'explanation', '')), ''),
        v_hash,
        CASE WHEN nullif(v_row ->> 'image_url', '') IS NULL THEN NULL
             ELSE jsonb_build_object('image_url', v_row ->> 'image_url') END,
        nullif(v_row ->> 'external_id', ''),
        p_batch_id
      )
      RETURNING id INTO v_question_id;

      FOR v_option IN SELECT * FROM jsonb_array_elements(v_options)
      LOOP
        INSERT INTO public.question_options (question_id, option_text, is_correct, display_order)
        VALUES (
          v_question_id,
          btrim(coalesce(v_option ->> 'text', '')),
          coalesce((v_option ->> 'is_correct')::boolean, false),
          coalesce((v_option ->> 'display_order')::int, 1)
        );
      END LOOP;

      IF p_exam_id IS NOT NULL THEN
        v_exam_subject_id := NULL;
        IF v_subject_id IS NOT NULL THEN
          SELECT es.id INTO v_exam_subject_id
          FROM public.exam_subjects es
          WHERE es.exam_id = p_exam_id AND es.subject_id = v_subject_id
          LIMIT 1;

          IF v_exam_subject_id IS NULL THEN
            INSERT INTO public.exam_subjects (exam_id, subject_id, coefficient, question_count)
            VALUES (p_exam_id, v_subject_id, 1, 0)
            RETURNING id INTO v_exam_subject_id;
          END IF;
        END IF;

        SELECT coalesce(max(eq.display_order), 0) + 1 INTO v_next_order
        FROM public.exam_questions eq WHERE eq.exam_id = p_exam_id;

        INSERT INTO public.exam_questions (exam_id, question_id, display_order, score, exam_subject_id)
        VALUES (p_exam_id, v_question_id, v_next_order, v_score, v_exam_subject_id);
      END IF;

      v_imported := v_imported + 1;
    EXCEPTION
      WHEN others THEN
        IF SQLERRM = 'سوال تکراری یافت شد و عملیات متوقف شد' THEN
          RAISE;
        END IF;
        v_failed := v_failed + 1;
        INSERT INTO public.question_import_errors (batch_id, row_number, field_name, error_code, error_message, raw_value)
        VALUES (p_batch_id, v_row_number, NULL, SQLSTATE, left(SQLERRM, 500),
                left(coalesce(v_row ->> 'question_text', ''), 500));
    END;
  END LOOP;

  UPDATE public.question_import_batches
  SET imported_rows = imported_rows + v_imported,
      duplicate_rows = duplicate_rows + v_duplicates,
      invalid_rows = invalid_rows + v_failed,
      status = CASE WHEN p_is_last_chunk THEN 'completed' ELSE 'importing' END,
      completed_at = CASE WHEN p_is_last_chunk THEN now() ELSE NULL END,
      exam_id = coalesce(p_exam_id, exam_id)
  WHERE id = p_batch_id;

  PERFORM public.log_audit('question_import_batch', p_batch_id, 'import_chunk',
    jsonb_build_object('chunk', p_chunk_number, 'imported', v_imported,
                       'duplicates', v_duplicates, 'failed', v_failed,
                       'is_last_chunk', p_is_last_chunk));

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'chunk_number', p_chunk_number,
    'imported', v_imported,
    'duplicates', v_duplicates,
    'failed', v_failed
  );
END;
$$;

-- 4) read a batch
CREATE OR REPLACE FUNCTION public.admin_get_question_import_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید';
  END IF;

  SELECT jsonb_build_object(
    'batch', to_jsonb(b) - 'created_by',
    'exam_title', (SELECT e.title FROM public.exams e WHERE e.id = b.exam_id),
    'question_count', (SELECT count(*) FROM public.questions q WHERE q.import_batch_id = b.id),
    'errors', coalesce((
      SELECT jsonb_agg(to_jsonb(er) ORDER BY er.row_number)
      FROM public.question_import_errors er WHERE er.batch_id = b.id
    ), '[]'::jsonb)
  ) INTO v_out
  FROM public.question_import_batches b
  WHERE b.id = p_batch_id;

  IF v_out IS NULL THEN
    RAISE EXCEPTION 'دسته ورود اطلاعات یافت نشد';
  END IF;

  RETURN v_out;
END;
$$;

-- 5) list batches
CREATE OR REPLACE FUNCTION public.admin_list_question_import_batches(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_total int;
  v_items jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.question_import_batches b
  WHERE p_status IS NULL OR b.status = p_status;

  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'created_at' DESC), '[]'::jsonb) INTO v_items
  FROM (
    SELECT to_jsonb(b) - 'created_by' || jsonb_build_object(
      'exam_title', (SELECT e.title FROM public.exams e WHERE e.id = b.exam_id)
    ) AS x
    FROM public.question_import_batches b
    WHERE p_status IS NULL OR b.status = p_status
    ORDER BY b.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) s;

  RETURN jsonb_build_object('total', v_total, 'items', v_items);
END;
$$;

-- 6) error report
CREATE OR REPLACE FUNCTION public.admin_download_question_import_errors(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(er) - 'id' ORDER BY er.row_number), '[]'::jsonb) INTO v_out
  FROM public.question_import_errors er
  WHERE er.batch_id = p_batch_id;

  PERFORM public.log_audit('question_import_batch', p_batch_id, 'download_errors', '{}'::jsonb);
  RETURN v_out;
END;
$$;

-- 7) rollback
CREATE OR REPLACE FUNCTION public.admin_rollback_question_import(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.question_import_batches WHERE id = p_batch_id) THEN
    RAISE EXCEPTION 'دسته ورود اطلاعات یافت نشد';
  END IF;

  DELETE FROM public.exam_questions eq
  USING public.questions q
  WHERE eq.question_id = q.id AND q.import_batch_id = p_batch_id;

  DELETE FROM public.question_options qo
  USING public.questions q
  WHERE qo.question_id = q.id AND q.import_batch_id = p_batch_id;

  WITH deleted AS (
    DELETE FROM public.questions q WHERE q.import_batch_id = p_batch_id RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM deleted;

  UPDATE public.question_import_batches
  SET status = 'rolled_back', imported_rows = 0, completed_at = now()
  WHERE id = p_batch_id;

  PERFORM public.log_audit('question_import_batch', p_batch_id, 'rollback',
    jsonb_build_object('deleted_questions', v_deleted));

  RETURN jsonb_build_object('deleted', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_question_import_batch(uuid, text, text, integer, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_validate_question_import(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_import_questions(uuid, uuid, jsonb, integer, boolean, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_question_import_batch(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_question_import_batches(integer, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_download_question_import_errors(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_rollback_question_import(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_create_question_import_batch(uuid, text, text, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_validate_question_import(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_questions(uuid, uuid, jsonb, integer, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_question_import_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_question_import_batches(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_download_question_import_errors(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_rollback_question_import(uuid) TO authenticated;