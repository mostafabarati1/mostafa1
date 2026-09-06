
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', f.sig);
    IF f.proname IN ('is_admin','has_role','has_active_subscription','can_view_exam',
                     'set_updated_at','handle_new_user','log_audit',
                     'finalize_gateway_payment','mark_gateway_payment_failed') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f.sig);
    END IF;
  END LOOP;
END $$;

INSERT INTO public.app_settings(key, value) VALUES
  ('site_name','"Exam Master Pro"'::jsonb),
  ('default_currency','"IRT"'::jsonb),
  ('trial_days','7'::jsonb),
  ('free_exam_quota','3'::jsonb),
  ('support_phone','"02100000000"'::jsonb),
  ('support_email','"support@example.com"'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.ai_settings(id) VALUES (true) ON CONFLICT DO NOTHING;

INSERT INTO public.payment_gateway_settings(id, gateway, enabled, sandbox, callback_path, currency)
VALUES (true,'zarinpal',false,true,'/payment/callback','IRT') ON CONFLICT DO NOTHING;

INSERT INTO public.sms_settings(id, provider, enabled, test_mode)
VALUES (true,'sunfar',false,true) ON CONFLICT DO NOTHING;

INSERT INTO public.plans(title, price, duration_months, is_active, display_order)
SELECT * FROM (VALUES
  ('پلن ماهانه', 99000::numeric, 1, true, 1),
  ('پلن سه ماهه', 249000::numeric, 3, true, 2),
  ('پلن سالانه', 890000::numeric, 12, true, 3)
) AS v(title, price, duration_months, is_active, display_order)
WHERE NOT EXISTS (SELECT 1 FROM public.plans);

INSERT INTO public.categories(name, slug, description, display_order, status) VALUES
  ('آزمون‌های استخدامی','employment','آزمون‌های دستگاه‌های اجرایی',1,'active'),
  ('آزمون‌های آموزشی','educational','آزمون‌های دانشگاهی و آموزشی',2,'active')
ON CONFLICT (slug) DO NOTHING;