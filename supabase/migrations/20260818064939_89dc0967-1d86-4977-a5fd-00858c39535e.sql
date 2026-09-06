-- ============================================================
-- Consolidated core schema (users, taxonomy, questions, exams)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','candidate');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text,
  mobile text,
  avatar_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','banned','suspended')),
  has_used_trial boolean NOT NULL DEFAULT false,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

CREATE TABLE IF NOT EXISTS public.trial_claims (
  email text PRIMARY KEY,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  first_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'candidate') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT ON public.trial_claims TO authenticated;
GRANT ALL ON public.trial_claims TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin()) WITH CHECK (id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete ON public.profiles FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS user_roles_write ON public.user_roles;
CREATE POLICY user_roles_write ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS trial_claims_select ON public.trial_claims;
CREATE POLICY trial_claims_select ON public.trial_claims FOR SELECT TO authenticated USING (public.is_admin());

-- ---------- taxonomy ----------
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  logo_url text,
  display_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  display_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);

CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text text NOT NULL,
  default_score numeric NOT NULL DEFAULT 1,
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','draft','archived')),
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  explanation text,
  content_hash text,
  media jsonb,
  external_id text,
  import_batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_questions_status ON public.questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_category ON public.questions(category_id);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON public.questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_questions_created_by ON public.questions(created_by);
CREATE INDEX IF NOT EXISTS idx_questions_content_hash ON public.questions(content_hash);
CREATE INDEX IF NOT EXISTS idx_questions_import_batch ON public.questions(import_batch_id);

CREATE TABLE IF NOT EXISTS public.question_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_question_options_question ON public.question_options(question_id);

DROP TRIGGER IF EXISTS trg_org_updated_at ON public.organizations;
CREATE TRIGGER trg_org_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_cat_updated_at ON public.categories;
CREATE TRIGGER trg_cat_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_subj_updated_at ON public.subjects;
CREATE TRIGGER trg_subj_updated_at BEFORE UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_q_updated_at ON public.questions;
CREATE TRIGGER trg_q_updated_at BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_options TO authenticated;
GRANT ALL ON public.organizations, public.categories, public.subjects, public.questions, public.question_options TO service_role;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_select ON public.organizations;
CREATE POLICY organizations_select ON public.organizations FOR SELECT TO authenticated
  USING (status = 'active' OR public.is_admin());
DROP POLICY IF EXISTS organizations_write ON public.organizations;
CREATE POLICY organizations_write ON public.organizations FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS categories_select ON public.categories;
CREATE POLICY categories_select ON public.categories FOR SELECT TO authenticated
  USING (status = 'active' OR public.is_admin());
DROP POLICY IF EXISTS categories_write ON public.categories;
CREATE POLICY categories_write ON public.categories FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS subjects_select ON public.subjects;
CREATE POLICY subjects_select ON public.subjects FOR SELECT TO authenticated
  USING (status = 'active' OR public.is_admin());
DROP POLICY IF EXISTS subjects_write ON public.subjects;
CREATE POLICY subjects_write ON public.subjects FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS questions_select ON public.questions;
CREATE POLICY questions_select ON public.questions FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS questions_write ON public.questions;
CREATE POLICY questions_write ON public.questions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS question_options_select ON public.question_options;
CREATE POLICY question_options_select ON public.question_options FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS question_options_write ON public.question_options;
CREATE POLICY question_options_write ON public.question_options FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------- exams ----------
CREATE TABLE IF NOT EXISTS public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  keywords text,
  meta_title text,
  meta_description text,
  level text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  access_type text NOT NULL DEFAULT 'public' CHECK (access_type IN ('public','private','invitation_only')),
  duration_minutes integer NOT NULL DEFAULT 60,
  max_attempts integer NOT NULL DEFAULT 1,
  passing_score numeric NOT NULL DEFAULT 50,
  is_free boolean NOT NULL DEFAULT true,
  price numeric NOT NULL DEFAULT 0,
  randomize_questions boolean NOT NULL DEFAULT false,
  randomize_options boolean NOT NULL DEFAULT false,
  show_correct_answers boolean NOT NULL DEFAULT false,
  year integer,
  period text,
  round text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exams_status ON public.exams(status);
CREATE INDEX IF NOT EXISTS idx_exams_org ON public.exams(organization_id);
CREATE INDEX IF NOT EXISTS idx_exams_category ON public.exams(category_id);

CREATE TABLE IF NOT EXISTS public.exam_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  coefficient numeric NOT NULL DEFAULT 1,
  question_count integer NOT NULL DEFAULT 0,
  time_limit_minutes integer,
  negative_marking boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, subject_id)
);

CREATE TABLE IF NOT EXISTS public.exam_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, category_id)
);

CREATE TABLE IF NOT EXISTS public.exam_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  exam_subject_id uuid REFERENCES public.exam_subjects(id) ON DELETE SET NULL,
  display_order integer NOT NULL DEFAULT 0,
  score numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, question_id)
);

CREATE TABLE IF NOT EXISTS public.exam_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS public.exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_ids uuid[],
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  submitted_at timestamptz,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','expired','graded')),
  correct_count integer NOT NULL DEFAULT 0,
  incorrect_count integer NOT NULL DEFAULT 0,
  unanswered_count integer NOT NULL DEFAULT 0,
  total_score numeric NOT NULL DEFAULT 0,
  earned_score numeric NOT NULL DEFAULT 0,
  passed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attempts_exam ON public.exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_attempts_candidate ON public.exam_attempts(candidate_id);

CREATE TABLE IF NOT EXISTS public.attempt_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_option_id uuid REFERENCES public.question_options(id) ON DELETE SET NULL,
  is_correct boolean,
  score_awarded numeric NOT NULL DEFAULT 0,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

DROP TRIGGER IF EXISTS trg_exams_updated_at ON public.exams;
CREATE TRIGGER trg_exams_updated_at BEFORE UPDATE ON public.exams FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.can_view_exam(_exam_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.exams e WHERE e.id = _exam_id AND (
      (e.access_type = 'public' AND e.status = 'published')
      OR (e.access_type IN ('private','invitation_only') AND EXISTS (
            SELECT 1 FROM public.exam_assignments a
            WHERE a.exam_id = e.id AND a.candidate_id = auth.uid()))
      OR public.is_admin()
    ));
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_assignments TO authenticated;
GRANT SELECT, DELETE ON public.exam_attempts TO authenticated;
GRANT ALL ON public.exams, public.exam_subjects, public.exam_categories, public.exam_questions,
  public.exam_assignments, public.exam_attempts, public.attempt_answers TO service_role;

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempt_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exams_select ON public.exams;
CREATE POLICY exams_select ON public.exams FOR SELECT TO authenticated
  USING ((access_type = 'public' AND status = 'published')
    OR (access_type IN ('private','invitation_only') AND EXISTS (
        SELECT 1 FROM public.exam_assignments a WHERE a.exam_id = exams.id AND a.candidate_id = auth.uid()))
    OR public.is_admin());
DROP POLICY IF EXISTS exams_write ON public.exams;
CREATE POLICY exams_write ON public.exams FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS exam_subjects_select ON public.exam_subjects;
CREATE POLICY exam_subjects_select ON public.exam_subjects FOR SELECT TO authenticated USING (public.can_view_exam(exam_id));
DROP POLICY IF EXISTS exam_subjects_write ON public.exam_subjects;
CREATE POLICY exam_subjects_write ON public.exam_subjects FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS exam_categories_select ON public.exam_categories;
CREATE POLICY exam_categories_select ON public.exam_categories FOR SELECT TO authenticated USING (public.can_view_exam(exam_id));
DROP POLICY IF EXISTS exam_categories_write ON public.exam_categories;
CREATE POLICY exam_categories_write ON public.exam_categories FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS exam_questions_select ON public.exam_questions;
CREATE POLICY exam_questions_select ON public.exam_questions FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS exam_questions_write ON public.exam_questions;
CREATE POLICY exam_questions_write ON public.exam_questions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS exam_assignments_select ON public.exam_assignments;
CREATE POLICY exam_assignments_select ON public.exam_assignments FOR SELECT TO authenticated
  USING (candidate_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS exam_assignments_write ON public.exam_assignments;
CREATE POLICY exam_assignments_write ON public.exam_assignments FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS exam_attempts_select ON public.exam_attempts;
CREATE POLICY exam_attempts_select ON public.exam_attempts FOR SELECT TO authenticated
  USING (candidate_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS exam_attempts_delete ON public.exam_attempts;
CREATE POLICY exam_attempts_delete ON public.exam_attempts FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS attempt_answers_admin ON public.attempt_answers;
CREATE POLICY attempt_answers_admin ON public.attempt_answers FOR SELECT TO authenticated USING (public.is_admin());

-- ---------- audit ----------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name text,
  entity text,
  entity_id uuid,
  action text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at DESC);

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.log_audit(_entity text, _entity_id uuid, _action text, _details jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.audit_logs(actor_id, actor_name, entity, entity_id, action, details)
  VALUES (auth.uid(), (SELECT full_name FROM public.profiles WHERE id = auth.uid()), _entity, _entity_id, _action, COALESCE(_details,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- ---------- bulk import ----------
CREATE OR REPLACE FUNCTION public.normalize_for_hash(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
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
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
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
  sheet_name text,
  failed_rows integer NOT NULL DEFAULT 0,
  current_chunk integer NOT NULL DEFAULT 0,
  total_chunks integer NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz,
  rolled_back_at timestamptz,
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

CREATE TABLE IF NOT EXISTS public.question_import_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.question_import_batches(id) ON DELETE CASCADE,
  chunk_number integer NOT NULL,
  processed integer NOT NULL DEFAULT 0,
  imported integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, chunk_number)
);

CREATE INDEX IF NOT EXISTS idx_question_import_errors_batch ON public.question_import_errors (batch_id);
CREATE INDEX IF NOT EXISTS idx_question_import_batches_creator ON public.question_import_batches (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_import_chunks_batch ON public.question_import_chunks (batch_id, chunk_number);

GRANT SELECT ON public.question_import_batches TO authenticated;
GRANT ALL ON public.question_import_batches TO service_role;
GRANT SELECT ON public.question_import_errors TO authenticated;
GRANT ALL ON public.question_import_errors TO service_role;
GRANT SELECT ON public.question_import_chunks TO authenticated;
GRANT ALL ON public.question_import_chunks TO service_role;

ALTER TABLE public.question_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_import_chunks ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS question_import_chunks_select ON public.question_import_chunks;
CREATE POLICY question_import_chunks_select ON public.question_import_chunks
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.question_import_batches b
      WHERE b.id = question_import_chunks.batch_id AND b.created_by = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.admin_create_question_import_batch(
  p_exam_id uuid DEFAULT NULL,
  p_file_name text DEFAULT NULL,
  p_file_type text DEFAULT NULL,
  p_total_rows integer DEFAULT 0,
  p_valid_rows integer DEFAULT 0,
  p_invalid_rows integer DEFAULT 0
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'دسترسی لازم را ندارید';
  END IF;

  INSERT INTO public.question_import_batches (
    created_by, exam_id, file_name, file_type, total_rows, valid_rows, invalid_rows, status
  ) VALUES (
    auth.uid(), p_exam_id,
    nullif(left(coalesce(p_file_name, ''), 300), ''),
    nullif(left(coalesce(p_file_type, ''), 50), ''),
    greatest(coalesce(p_total_rows, 0), 0),
    greatest(coalesce(p_valid_rows, 0), 0),
    greatest(coalesce(p_invalid_rows, 0), 0),
    'importing'
  ) RETURNING id INTO v_id;

  PERFORM public.log_audit('question_import_batch', v_id, 'create',
    jsonb_build_object('file_name', p_file_name, 'file_type', p_file_type, 'total_rows', p_total_rows));

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_validate_question_import(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
      coalesce(v_row ->> 'question_text', ''), v_options,
      coalesce(v_row ->> 'difficulty', 'medium'),
      nullif(v_row ->> 'category_id', '')::uuid
    );

    SELECT q.id INTO v_existing FROM public.questions q WHERE q.content_hash = v_hash LIMIT 1;

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

CREATE OR REPLACE FUNCTION public.admin_import_questions(
  p_batch_id uuid,
  p_exam_id uuid,
  p_rows jsonb,
  p_chunk_number integer DEFAULT 1,
  p_is_last_chunk boolean DEFAULT true,
  p_duplicate_policy text DEFAULT 'skip',
  p_status text DEFAULT 'active'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
        btrim(v_row ->> 'question_text'), v_score, v_difficulty,
        CASE WHEN coalesce(p_status, 'active') IN ('active', 'draft', 'archived') THEN p_status ELSE 'active' END,
        v_category_id, v_subject_id, auth.uid(),
        nullif(btrim(coalesce(v_row ->> 'explanation', '')), ''),
        v_hash,
        CASE WHEN nullif(v_row ->> 'image_url', '') IS NULL THEN NULL
             ELSE jsonb_build_object('image_url', v_row ->> 'image_url') END,
        nullif(v_row ->> 'external_id', ''),
        p_batch_id
      ) RETURNING id INTO v_question_id;

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

CREATE OR REPLACE FUNCTION public.admin_get_question_import_batch(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_out jsonb;
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

CREATE OR REPLACE FUNCTION public.admin_list_question_import_batches(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_status text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION public.admin_download_question_import_errors(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_out jsonb;
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

CREATE OR REPLACE FUNCTION public.admin_rollback_question_import(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted int := 0;
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

-- ---------- inline resource creation for bulk import ----------
CREATE OR REPLACE FUNCTION public.create_category_for_bulk_import(
  p_name text,
  p_slug text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_parent_id uuid DEFAULT NULL,
  p_status text DEFAULT 'active',
  p_display_order integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid; v_name text; v_slug text; v_status text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی لازم را ندارید'; END IF;

  v_name := nullif(btrim(left(coalesce(p_name, ''), 200)), '');
  IF v_name IS NULL THEN RAISE EXCEPTION 'نام دسته‌بندی الزامی است'; END IF;

  v_status := CASE WHEN coalesce(p_status, 'active') IN ('active','inactive') THEN p_status ELSE 'active' END;

  v_slug := nullif(btrim(left(coalesce(p_slug, ''), 120)), '');
  IF v_slug IS NULL THEN
    v_slug := btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-');
    IF v_slug = '' THEN v_slug := 'category'; END IF;
    IF EXISTS (SELECT 1 FROM public.categories WHERE slug = v_slug) THEN
      v_slug := v_slug || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.categories WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'این نامک قبلاً استفاده شده است';
  END IF;

  IF p_parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_parent_id) THEN
    RAISE EXCEPTION 'دسته والد یافت نشد';
  END IF;

  INSERT INTO public.categories (name, slug, description, parent_id, display_order, status)
  VALUES (v_name, v_slug, nullif(btrim(left(coalesce(p_description, ''), 2000)), ''),
          p_parent_id, greatest(coalesce(p_display_order, 0), 0), v_status)
  RETURNING id INTO v_id;

  PERFORM public.log_audit('category', v_id, 'create_from_bulk_import',
    jsonb_build_object('name', v_name, 'slug', v_slug));

  RETURN jsonb_build_object('id', v_id, 'name', v_name, 'slug', v_slug, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_subject_for_bulk_import(
  p_name text,
  p_slug text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_status text DEFAULT 'active',
  p_display_order integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid; v_name text; v_slug text; v_status text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی لازم را ندارید'; END IF;

  v_name := nullif(btrim(left(coalesce(p_name, ''), 200)), '');
  IF v_name IS NULL THEN RAISE EXCEPTION 'نام درس الزامی است'; END IF;

  v_status := CASE WHEN coalesce(p_status, 'active') IN ('active','inactive') THEN p_status ELSE 'active' END;

  v_slug := nullif(btrim(left(coalesce(p_slug, ''), 120)), '');
  IF v_slug IS NULL THEN
    v_slug := btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-');
    IF v_slug = '' THEN v_slug := 'subject'; END IF;
    IF EXISTS (SELECT 1 FROM public.subjects WHERE slug = v_slug) THEN
      v_slug := v_slug || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.subjects WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'این نامک قبلاً استفاده شده است';
  END IF;

  INSERT INTO public.subjects (name, slug, description, display_order, status)
  VALUES (v_name, v_slug, nullif(btrim(left(coalesce(p_description, ''), 2000)), ''),
          greatest(coalesce(p_display_order, 0), 0), v_status)
  RETURNING id INTO v_id;

  PERFORM public.log_audit('subject', v_id, 'create_from_bulk_import',
    jsonb_build_object('name', v_name, 'slug', v_slug));

  RETURN jsonb_build_object('id', v_id, 'name', v_name, 'slug', v_slug, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_exam_for_bulk_import(
  p_title text,
  p_slug text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_level text DEFAULT NULL,
  p_duration_minutes integer DEFAULT 60,
  p_max_attempts integer DEFAULT 1,
  p_passing_score numeric DEFAULT 50,
  p_access_type text DEFAULT 'public',
  p_is_free boolean DEFAULT true,
  p_price numeric DEFAULT 0,
  p_status text DEFAULT 'draft',
  p_year integer DEFAULT NULL,
  p_period text DEFAULT NULL,
  p_round text DEFAULT NULL,
  p_subject_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid; v_title text; v_slug text; v_status text; v_access text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی لازم را ندارید'; END IF;

  v_title := nullif(btrim(left(coalesce(p_title, ''), 300)), '');
  IF v_title IS NULL THEN RAISE EXCEPTION 'عنوان آزمون الزامی است'; END IF;

  v_status := CASE WHEN coalesce(p_status, 'draft') IN ('draft','published','archived') THEN p_status ELSE 'draft' END;
  v_access := CASE WHEN coalesce(p_access_type, 'public') IN ('public','private','invitation_only') THEN p_access_type ELSE 'public' END;

  v_slug := nullif(btrim(left(coalesce(p_slug, ''), 120)), '');
  IF v_slug IS NULL THEN
    v_slug := btrim(regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g'), '-');
    IF v_slug = '' THEN v_slug := 'exam'; END IF;
    IF EXISTS (SELECT 1 FROM public.exams WHERE slug = v_slug) THEN
      v_slug := v_slug || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.exams WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'این نامک قبلاً استفاده شده است';
  END IF;

  INSERT INTO public.exams (
    title, slug, description, level, status, access_type, duration_minutes, max_attempts,
    passing_score, is_free, price, year, period, round, category_id, organization_id, created_by
  ) VALUES (
    v_title, v_slug,
    nullif(btrim(left(coalesce(p_description, ''), 4000)), ''),
    nullif(btrim(left(coalesce(p_level, ''), 100)), ''),
    v_status, v_access,
    greatest(coalesce(p_duration_minutes, 60), 1),
    greatest(coalesce(p_max_attempts, 1), 1),
    greatest(coalesce(p_passing_score, 50), 0),
    coalesce(p_is_free, true),
    greatest(coalesce(p_price, 0), 0),
    p_year,
    nullif(btrim(left(coalesce(p_period, ''), 100)), ''),
    nullif(btrim(left(coalesce(p_round, ''), 100)), ''),
    p_category_id, p_organization_id, auth.uid()
  ) RETURNING id INTO v_id;

  IF p_category_id IS NOT NULL THEN
    INSERT INTO public.exam_categories (exam_id, category_id)
    VALUES (v_id, p_category_id) ON CONFLICT (exam_id, category_id) DO NOTHING;
  END IF;

  IF p_subject_id IS NOT NULL THEN
    INSERT INTO public.exam_subjects (exam_id, subject_id, coefficient, question_count)
    VALUES (v_id, p_subject_id, 1, 0) ON CONFLICT (exam_id, subject_id) DO NOTHING;
  END IF;

  PERFORM public.log_audit('exam', v_id, 'create_from_bulk_import',
    jsonb_build_object('title', v_title, 'slug', v_slug, 'status', v_status));

  RETURN jsonb_build_object('id', v_id, 'title', v_title, 'slug', v_slug, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_import_link_exam_subject(
  p_exam_id uuid,
  p_subject_id uuid,
  p_coefficient numeric DEFAULT 1
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_created boolean := false;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی لازم را ندارید'; END IF;
  IF p_exam_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.exams WHERE id = p_exam_id) THEN
    RAISE EXCEPTION 'آزمون یافت نشد';
  END IF;
  IF p_subject_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.subjects WHERE id = p_subject_id) THEN
    RAISE EXCEPTION 'درس یافت نشد';
  END IF;

  SELECT id INTO v_id FROM public.exam_subjects WHERE exam_id = p_exam_id AND subject_id = p_subject_id;

  IF v_id IS NULL THEN
    INSERT INTO public.exam_subjects (exam_id, subject_id, coefficient, question_count)
    VALUES (p_exam_id, p_subject_id, greatest(coalesce(p_coefficient, 1), 0), 0)
    RETURNING id INTO v_id;
    v_created := true;
  END IF;

  RETURN jsonb_build_object('exam_subject_id', v_id, 'created', v_created);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_import_questions_chunk(
  p_batch_id uuid,
  p_exam_id uuid,
  p_rows jsonb,
  p_chunk_number integer DEFAULT 1,
  p_total_chunks integer DEFAULT 1,
  p_duplicate_policy text DEFAULT 'skip',
  p_status text DEFAULT 'active'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing public.question_import_chunks%ROWTYPE;
  v_result jsonb;
  v_processed int; v_imported int; v_duplicates int; v_failed int;
  v_status text; v_is_last boolean;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی لازم را ندارید'; END IF;
  IF p_batch_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.question_import_batches WHERE id = p_batch_id) THEN
    RAISE EXCEPTION 'دسته ورود اطلاعات یافت نشد';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'ورودی نامعتبر است';
  END IF;

  v_is_last := coalesce(p_chunk_number, 1) >= greatest(coalesce(p_total_chunks, 1), 1);

  SELECT * INTO v_existing FROM public.question_import_chunks
  WHERE batch_id = p_batch_id AND chunk_number = coalesce(p_chunk_number, 1);

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'batch_id', p_batch_id,
      'chunk_number', v_existing.chunk_number,
      'processed', v_existing.processed,
      'imported', v_existing.imported,
      'duplicates', v_existing.duplicates,
      'failed', v_existing.failed,
      'next_chunk', CASE WHEN v_is_last THEN NULL ELSE coalesce(p_chunk_number, 1) + 1 END,
      'status', (SELECT status FROM public.question_import_batches WHERE id = p_batch_id),
      'skipped', true
    );
  END IF;

  UPDATE public.question_import_batches
  SET started_at = coalesce(started_at, now()),
      current_chunk = coalesce(p_chunk_number, 1),
      total_chunks = greatest(coalesce(p_total_chunks, 1), total_chunks),
      status = 'importing'
  WHERE id = p_batch_id;

  v_result := public.admin_import_questions(
    p_batch_id, p_exam_id, p_rows, coalesce(p_chunk_number, 1), v_is_last,
    coalesce(p_duplicate_policy, 'skip'), coalesce(p_status, 'active')
  );

  v_processed := jsonb_array_length(p_rows);
  v_imported := coalesce((v_result ->> 'imported')::int, 0);
  v_duplicates := coalesce((v_result ->> 'duplicates')::int, 0);
  v_failed := coalesce((v_result ->> 'failed')::int, 0);

  INSERT INTO public.question_import_chunks (batch_id, chunk_number, processed, imported, duplicates, failed, status)
  VALUES (p_batch_id, coalesce(p_chunk_number, 1), v_processed, v_imported, v_duplicates, v_failed, 'completed')
  ON CONFLICT (batch_id, chunk_number) DO NOTHING;

  v_status := CASE
    WHEN v_is_last AND v_failed > 0 THEN 'partial'
    WHEN v_is_last THEN 'completed'
    ELSE 'importing'
  END;

  UPDATE public.question_import_batches
  SET failed_rows = failed_rows + v_failed,
      status = v_status,
      completed_at = CASE WHEN v_is_last THEN now() ELSE completed_at END
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'chunk_number', coalesce(p_chunk_number, 1),
    'processed', v_processed,
    'imported', v_imported,
    'duplicates', v_duplicates,
    'failed', v_failed,
    'next_chunk', CASE WHEN v_is_last THEN NULL ELSE coalesce(p_chunk_number, 1) + 1 END,
    'status', v_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_question_import_progress(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_out jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی لازم را ندارید'; END IF;

  SELECT jsonb_build_object(
    'batch', to_jsonb(b) - 'created_by',
    'applied_chunks', coalesce((
      SELECT jsonb_agg(c.chunk_number ORDER BY c.chunk_number)
      FROM public.question_import_chunks c WHERE c.batch_id = b.id
    ), '[]'::jsonb),
    'failed_rows', coalesce((
      SELECT jsonb_agg(DISTINCT er.row_number)
      FROM public.question_import_errors er
      WHERE er.batch_id = b.id AND coalesce(er.error_code, '') <> 'duplicate'
    ), '[]'::jsonb)
  ) INTO v_out
  FROM public.question_import_batches b
  WHERE b.id = p_batch_id;

  IF v_out IS NULL THEN RAISE EXCEPTION 'دسته ورود اطلاعات یافت نشد'; END IF;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_rollback_question_import_v2(p_batch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_out jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'دسترسی لازم را ندارید'; END IF;

  v_out := public.admin_rollback_question_import(p_batch_id);

  UPDATE public.question_import_batches
  SET status = 'rolled_back', rolled_back_at = now()
  WHERE id = p_batch_id;

  DELETE FROM public.question_import_chunks WHERE batch_id = p_batch_id;

  RETURN coalesce(v_out, '{}'::jsonb) || jsonb_build_object('status', 'rolled_back');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_import_questions(uuid, uuid, jsonb, integer, boolean, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_import_questions_chunk(uuid, uuid, jsonb, integer, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_category_for_bulk_import(text, text, text, uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_subject_for_bulk_import(text, text, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_exam_for_bulk_import(text, text, text, uuid, uuid, text, integer, integer, numeric, text, boolean, numeric, text, integer, text, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_create_question_import_batch(uuid, text, text, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_validate_question_import(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_questions(uuid, uuid, jsonb, integer, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_questions_chunk(uuid, uuid, jsonb, integer, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_question_import_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_question_import_batches(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_download_question_import_errors(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_rollback_question_import(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_rollback_question_import_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_question_import_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_category_for_bulk_import(text, text, text, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_subject_for_bulk_import(text, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_exam_for_bulk_import(text, text, text, uuid, uuid, text, integer, integer, numeric, text, boolean, numeric, text, integer, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_import_link_exam_subject(uuid, uuid, numeric) TO authenticated;