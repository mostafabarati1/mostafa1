-- SMS tables: explicit Data API grants (admin-only via policies)
GRANT SELECT, INSERT, UPDATE ON public.sms_settings TO authenticated;
GRANT ALL ON public.sms_settings TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.sms_delivery_logs TO authenticated;
GRANT ALL ON public.sms_delivery_logs TO service_role;

ALTER TABLE public.sms_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_settings_admin_all ON public.sms_settings;
CREATE POLICY sms_settings_admin_all
  ON public.sms_settings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS sms_delivery_logs_admin_all ON public.sms_delivery_logs;
CREATE POLICY sms_delivery_logs_admin_all
  ON public.sms_delivery_logs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- can_view_exam is called from RLS policies on exam_subjects / exam_categories
GRANT EXECUTE ON FUNCTION public.can_view_exam(uuid) TO authenticated;