-- Restore signup trigger for new accounts
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Phone (OTP) login support
CREATE TABLE IF NOT EXISTS public.otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON public.otp_codes(phone_e164, created_at DESC);

CREATE TABLE IF NOT EXISTS public.phone_login_attempts (
  phone_e164 text PRIMARY KEY,
  last_request_at timestamptz NOT NULL DEFAULT now(),
  request_count_1h integer NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL,
  provider text NOT NULL,
  provider_message_id text,
  template text,
  status text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_send_log_created ON public.sms_send_log(created_at DESC);

REVOKE ALL ON public.otp_codes FROM anon, authenticated;
REVOKE ALL ON public.phone_login_attempts FROM anon, authenticated;
REVOKE ALL ON public.sms_send_log FROM anon, authenticated;
GRANT ALL ON public.otp_codes TO service_role;
GRANT ALL ON public.phone_login_attempts TO service_role;
GRANT ALL ON public.sms_send_log TO service_role;
GRANT SELECT ON public.sms_send_log TO authenticated;

ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_send_log_select ON public.sms_send_log;
CREATE POLICY sms_send_log_select ON public.sms_send_log FOR SELECT TO authenticated USING (public.is_admin());

DROP TRIGGER IF EXISTS trg_phone_login_attempts_updated_at ON public.phone_login_attempts;
CREATE TRIGGER trg_phone_login_attempts_updated_at BEFORE UPDATE ON public.phone_login_attempts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();