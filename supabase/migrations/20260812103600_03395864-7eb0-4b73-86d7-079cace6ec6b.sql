DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','candidate');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text,
  mobile text,
  avatar_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','banned')),
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
REVOKE ALL ON public.trial_claims FROM anon, authenticated;
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
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','draft')),
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_questions_status ON public.questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_category ON public.questions(category_id);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON public.questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_questions_created_by ON public.questions(created_by);

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
CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  duration_months integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('trial','active','expired','cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON public.subscriptions(expires_at);

CREATE TABLE IF NOT EXISTS public.admin_subscription_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  days integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_gateway_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  gateway text NOT NULL DEFAULT 'zarinpal',
  enabled boolean NOT NULL DEFAULT false,
  sandbox boolean NOT NULL DEFAULT true,
  merchant_id text,
  callback_path text NOT NULL DEFAULT '/payment/callback',
  description text NOT NULL DEFAULT 'خرید اشتراک سامانه آزمون آنلاین',
  currency text NOT NULL DEFAULT 'IRT' CHECK (currency IN ('IRT','IRR')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IRT',
  gateway text NOT NULL DEFAULT 'zarinpal',
  authority text,
  ref_id text,
  card_pan text,
  transaction_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','paid','verified','failed','cancelled','refunded')),
  paid_at timestamptz,
  verified_at timestamptz,
  failure_reason text,
  gateway_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_authority ON public.payments(authority) WHERE authority IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_ref_id ON public.payments(ref_id) WHERE ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_status_created ON public.payments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_plan ON public.payments(plan_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription ON public.payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments(user_id);

CREATE TABLE IF NOT EXISTS public.ai_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  provider text NOT NULL DEFAULT 'internal',
  model text NOT NULL DEFAULT '',
  api_key text,
  cache_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_explanations (
  question_id uuid PRIMARY KEY REFERENCES public.questions(id) ON DELETE CASCADE,
  explanation text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.sms_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  provider text NOT NULL DEFAULT 'sunfar',
  enabled boolean NOT NULL DEFAULT false,
  test_mode boolean NOT NULL DEFAULT true,
  api_key text,
  verify_template_id text,
  welcome_template_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.sms_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  request_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_otp_mobile ON public.sms_otp_codes(mobile);
CREATE INDEX IF NOT EXISTS idx_sms_otp_expires ON public.sms_otp_codes(expires_at);

CREATE TABLE IF NOT EXISTS public.sms_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile_masked text,
  purpose text,
  provider_status integer,
  success boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.question_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attempt_id uuid REFERENCES public.exam_attempts(id) ON DELETE SET NULL,
  exam_id uuid REFERENCES public.exams(id) ON DELETE SET NULL,
  reason text NOT NULL,
  description text,
  admin_note text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_question ON public.question_reports(question_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.question_reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.question_reports(reporter_id);

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

DROP TRIGGER IF EXISTS trg_plans_updated_at ON public.plans;
CREATE TRIGGER trg_plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_reports_updated_at ON public.question_reports;
CREATE TRIGGER trg_reports_updated_at BEFORE UPDATE ON public.question_reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = _user_id
      AND s.status IN ('active','trial')
      AND (s.expires_at IS NULL OR s.expires_at > now())
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id AND p.trial_ends_at IS NOT NULL AND p.trial_ends_at > now()
  );
$$;

GRANT SELECT ON public.plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO service_role;
GRANT SELECT, DELETE ON public.subscriptions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.admin_subscription_grants TO authenticated;
GRANT SELECT, DELETE ON public.payments TO authenticated;
GRANT SELECT ON public.app_settings TO authenticated;
GRANT INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_reports TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.plans, public.subscriptions, public.admin_subscription_grants,
  public.payments, public.payment_gateway_settings, public.ai_settings, public.ai_explanations,
  public.app_settings, public.sms_settings, public.sms_otp_codes, public.sms_delivery_logs,
  public.question_reports, public.audit_logs TO service_role;
REVOKE ALL ON public.payment_gateway_settings, public.ai_settings, public.sms_settings,
  public.sms_otp_codes, public.sms_delivery_logs, public.ai_explanations FROM anon, authenticated;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_subscription_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateway_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_explanations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_select ON public.plans;
CREATE POLICY plans_select ON public.plans FOR SELECT TO authenticated USING (is_active OR public.is_admin());

DROP POLICY IF EXISTS subscriptions_select ON public.subscriptions;
CREATE POLICY subscriptions_select ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS subscriptions_delete ON public.subscriptions;
CREATE POLICY subscriptions_delete ON public.subscriptions FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS grants_select ON public.admin_subscription_grants;
CREATE POLICY grants_select ON public.admin_subscription_grants FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS grants_insert ON public.admin_subscription_grants;
CREATE POLICY grants_insert ON public.admin_subscription_grants FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS grants_delete ON public.admin_subscription_grants;
CREATE POLICY grants_delete ON public.admin_subscription_grants FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS payments_select ON public.payments;
CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS payments_delete ON public.payments;
CREATE POLICY payments_delete ON public.payments FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS app_settings_select ON public.app_settings;
CREATE POLICY app_settings_select ON public.app_settings FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS app_settings_insert ON public.app_settings;
CREATE POLICY app_settings_insert ON public.app_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS app_settings_update ON public.app_settings;
CREATE POLICY app_settings_update ON public.app_settings FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS question_reports_select ON public.question_reports;
CREATE POLICY question_reports_select ON public.question_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS question_reports_insert ON public.question_reports;
CREATE POLICY question_reports_insert ON public.question_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());
DROP POLICY IF EXISTS question_reports_update ON public.question_reports;
CREATE POLICY question_reports_update ON public.question_reports FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS question_reports_delete ON public.question_reports;
CREATE POLICY question_reports_delete ON public.question_reports FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());