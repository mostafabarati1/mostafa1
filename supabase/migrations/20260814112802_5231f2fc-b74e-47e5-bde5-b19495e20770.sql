-- Public catalog: readable by everyone
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['subjects','categories','organizations','exams','exam_categories','exam_subjects']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "public_read_%1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "public_read_%1$s" ON public.%1$I FOR SELECT TO anon, authenticated USING (true)', t);
  END LOOP;
END $$;

-- Admin full management
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['subjects','categories','organizations','exams','exam_categories','exam_subjects',
    'exam_questions','questions','question_options','plans','app_settings','ai_settings','sms_settings',
    'payment_gateway_settings','audit_logs','question_reports','exam_assignments','subscriptions',
    'admin_subscription_grants','payments','exam_attempts','attempt_answers']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "admin_all_%1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "admin_all_%1$s" ON public.%1$I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', t);
  END LOOP;
END $$;

-- Admin-only reads of exam content
DROP POLICY IF EXISTS "admin_read_exam_questions" ON public.exam_questions;

-- Own-data reads for candidates
DROP POLICY IF EXISTS "own_read_exam_attempts" ON public.exam_attempts;
CREATE POLICY "own_read_exam_attempts" ON public.exam_attempts FOR SELECT TO authenticated
  USING (candidate_id = auth.uid());

DROP POLICY IF EXISTS "own_read_attempt_answers" ON public.attempt_answers;
CREATE POLICY "own_read_attempt_answers" ON public.attempt_answers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exam_attempts a WHERE a.id = attempt_id AND a.candidate_id = auth.uid()));

DROP POLICY IF EXISTS "own_read_exam_assignments" ON public.exam_assignments;
CREATE POLICY "own_read_exam_assignments" ON public.exam_assignments FOR SELECT TO authenticated
  USING (candidate_id = auth.uid());

DROP POLICY IF EXISTS "own_read_payments" ON public.payments;
CREATE POLICY "own_read_payments" ON public.payments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own_read_subscriptions" ON public.subscriptions;
CREATE POLICY "own_read_subscriptions" ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());