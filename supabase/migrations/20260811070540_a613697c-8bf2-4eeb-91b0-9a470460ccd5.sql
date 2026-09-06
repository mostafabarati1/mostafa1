
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