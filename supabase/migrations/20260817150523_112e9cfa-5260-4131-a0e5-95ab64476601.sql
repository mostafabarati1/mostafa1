-- SMS admin: campaigns, richer delivery logs, sender line setting
ALTER TABLE public.sms_settings ADD COLUMN IF NOT EXISTS sender_line text;

CREATE TABLE IF NOT EXISTS public.sms_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  message text NOT NULL,
  provider text NOT NULL,
  test_mode boolean NOT NULL DEFAULT true,
  audience text NOT NULL DEFAULT 'manual',
  total_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sms_campaigns TO authenticated;
GRANT ALL ON public.sms_campaigns TO service_role;
ALTER TABLE public.sms_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_campaigns_admin_all ON public.sms_campaigns;
CREATE POLICY sms_campaigns_admin_all ON public.sms_campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.sms_delivery_logs
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.sms_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS sent_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

GRANT SELECT ON public.sms_delivery_logs TO authenticated;
GRANT ALL ON public.sms_delivery_logs TO service_role;

CREATE INDEX IF NOT EXISTS sms_delivery_logs_dedupe_idx
  ON public.sms_delivery_logs (dedupe_key, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_delivery_logs_campaign_idx
  ON public.sms_delivery_logs (campaign_id);
CREATE INDEX IF NOT EXISTS sms_campaigns_created_idx
  ON public.sms_campaigns (created_at DESC);