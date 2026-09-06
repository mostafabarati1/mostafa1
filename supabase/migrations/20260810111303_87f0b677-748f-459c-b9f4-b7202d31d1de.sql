
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
CREATE INDEX IF NOT EXISTS idx_exams_published ON public.exams(created_at DESC) WHERE status = 'published';

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
CREATE INDEX IF NOT EXISTS idx_attempts_status ON public.exam_attempts(status);

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
REVOKE ALL ON public.attempt_answers FROM anon, authenticated;

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
CREATE POLICY exam_assignments_write ON public.exam_assignments FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS exam_attempts_select ON public.exam_attempts;
CREATE POLICY exam_attempts_select ON public.exam_attempts FOR SELECT TO authenticated
  USING (candidate_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS exam_attempts_delete ON public.exam_attempts;
CREATE POLICY exam_attempts_delete ON public.exam_attempts FOR DELETE TO authenticated USING (public.is_admin());
