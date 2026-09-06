-- ============ 1) PLANS: additive columns ============
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'IRT',
  ADD COLUMN IF NOT EXISTS exam_quota integer,
  ADD COLUMN IF NOT EXISTS practice_quota integer,
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.plans ADD CONSTRAINT plans_currency_check CHECK (currency IN ('IRT','IRR'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.plans ADD CONSTRAINT plans_price_check CHECK (price >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.plans ADD CONSTRAINT plans_duration_check CHECK (duration_months >= 1 AND duration_months <= 60);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.plans ADD CONSTRAINT plans_quota_check CHECK (
    (exam_quota IS NULL OR exam_quota >= 0) AND (practice_quota IS NULL OR practice_quota >= 0)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ 2) PAYMENTS: additive refund/manual-verify columns ============
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS refunded_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_verified_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS manual_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  provider_reference text,
  error_code text,
  reason text,
  idempotency_key text NOT NULL UNIQUE,
  requested_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT ON public.payment_refunds TO authenticated;
GRANT ALL ON public.payment_refunds TO service_role;
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_refunds_admin_select ON public.payment_refunds;
CREATE POLICY payment_refunds_admin_select ON public.payment_refunds
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS payment_refunds_payment_idx ON public.payment_refunds(payment_id);

-- ============ 3) ERROR LOGS ============
CREATE TABLE IF NOT EXISTS public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('critical','error','warning','info')),
  source text NOT NULL,
  message text NOT NULL,
  error_code text,
  operation text,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  correlation_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id),
  resolution_note text
);

GRANT SELECT ON public.error_logs TO authenticated;
GRANT ALL ON public.error_logs TO service_role;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS error_logs_admin_select ON public.error_logs;
CREATE POLICY error_logs_admin_select ON public.error_logs
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS error_logs_created_idx ON public.error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_severity_idx ON public.error_logs(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_source_idx ON public.error_logs(source, created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_unresolved_idx ON public.error_logs(created_at DESC) WHERE resolved_at IS NULL;

-- ============ 4) PLAN RPCs ============
CREATE OR REPLACE FUNCTION public.admin_save_plan(
  p_id uuid,
  p_title text,
  p_price numeric,
  p_duration_months integer,
  p_is_active boolean,
  p_display_order integer DEFAULT 0,
  p_currency text DEFAULT 'IRT',
  p_exam_quota integer DEFAULT NULL,
  p_practice_quota integer DEFAULT NULL,
  p_features jsonb DEFAULT '[]'::jsonb,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before jsonb; v_row public.plans; v_title text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_title := btrim(COALESCE(p_title,''));
  IF length(v_title) < 2 OR length(v_title) > 120 THEN RAISE EXCEPTION 'invalid_plan_title'; END IF;
  IF p_price IS NULL OR p_price < 0 THEN RAISE EXCEPTION 'invalid_plan_price'; END IF;
  IF p_duration_months IS NULL OR p_duration_months < 1 OR p_duration_months > 60 THEN RAISE EXCEPTION 'invalid_plan_duration'; END IF;
  IF COALESCE(p_currency,'') NOT IN ('IRT','IRR') THEN RAISE EXCEPTION 'invalid_plan_currency'; END IF;
  IF p_exam_quota IS NOT NULL AND p_exam_quota < 0 THEN RAISE EXCEPTION 'invalid_plan_quota'; END IF;
  IF p_practice_quota IS NOT NULL AND p_practice_quota < 0 THEN RAISE EXCEPTION 'invalid_plan_quota'; END IF;
  IF COALESCE(p_display_order,0) < 0 THEN RAISE EXCEPTION 'invalid_plan_order'; END IF;
  IF jsonb_typeof(COALESCE(p_features,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'invalid_plan_features'; END IF;
  IF jsonb_array_length(COALESCE(p_features,'[]'::jsonb)) > 20 THEN RAISE EXCEPTION 'invalid_plan_features'; END IF;

  IF p_id IS NOT NULL THEN
    SELECT to_jsonb(p) INTO v_before FROM public.plans p WHERE p.id = p_id;
    IF v_before IS NULL THEN RAISE EXCEPTION 'plan not found'; END IF;
    UPDATE public.plans SET
      title = v_title, price = p_price, duration_months = p_duration_months,
      is_active = COALESCE(p_is_active,true), display_order = COALESCE(p_display_order,0),
      currency = p_currency, exam_quota = p_exam_quota, practice_quota = p_practice_quota,
      features = COALESCE(p_features,'[]'::jsonb), updated_at = now()
    WHERE id = p_id RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.plans(title, price, duration_months, is_active, display_order, currency, exam_quota, practice_quota, features)
    VALUES (v_title, p_price, p_duration_months, COALESCE(p_is_active,true), COALESCE(p_display_order,0),
            p_currency, p_exam_quota, p_practice_quota, COALESCE(p_features,'[]'::jsonb))
    RETURNING * INTO v_row;
  END IF;

  PERFORM public.log_audit('plans', v_row.id,
    CASE WHEN p_id IS NULL THEN 'create' ELSE 'update' END,
    jsonb_build_object('before', v_before, 'after', to_jsonb(v_row), 'reason', p_reason, 'success', true));

  RETURN jsonb_build_object('id', v_row.id, 'mode', CASE WHEN p_id IS NULL THEN 'created' ELSE 'updated' END);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_plan(p_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before jsonb; v_active int; v_refs int; v_mode text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF btrim(COALESCE(p_reason,'')) = '' THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT to_jsonb(p) INTO v_before FROM public.plans p WHERE p.id = p_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'plan not found'; END IF;

  SELECT count(*) INTO v_active FROM public.subscriptions
    WHERE plan_id = p_id AND status IN ('active','trial') AND (expires_at IS NULL OR expires_at > now());
  SELECT count(*) INTO v_refs FROM public.payments WHERE plan_id = p_id;
  IF v_refs = 0 THEN
    SELECT count(*) INTO v_refs FROM public.subscriptions WHERE plan_id = p_id;
  END IF;

  IF v_active > 0 OR v_refs > 0 THEN
    UPDATE public.plans SET is_active = false, archived_at = now(), updated_at = now() WHERE id = p_id;
    v_mode := 'archived';
  ELSE
    DELETE FROM public.plans WHERE id = p_id;
    v_mode := 'deleted';
  END IF;

  PERFORM public.log_audit('plans', p_id, v_mode,
    jsonb_build_object('before', v_before, 'after', NULL, 'reason', p_reason,
                       'active_subscriptions', v_active, 'references', v_refs, 'success', true));

  RETURN jsonb_build_object('mode', v_mode, 'active_subscriptions', v_active);
END; $$;

-- ============ 5) APP SETTINGS RPC ============
CREATE OR REPLACE FUNCTION public.admin_save_setting(
  p_key text, p_value jsonb, p_expected_updated_at timestamptz DEFAULT NULL, p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before jsonb; v_current timestamptz; v_updated timestamptz; v_key text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_key := btrim(COALESCE(p_key,''));
  IF v_key !~ '^[a-z0-9_]{2,60}$' THEN RAISE EXCEPTION 'invalid_setting_key'; END IF;
  IF p_value IS NULL THEN RAISE EXCEPTION 'invalid_setting_value'; END IF;
  IF v_key ~ '(api_key|secret|token|password|private_key|webhook)' THEN RAISE EXCEPTION 'secret_not_allowed_here'; END IF;

  SELECT s.value, s.updated_at INTO v_before, v_current FROM public.app_settings s WHERE s.key = v_key FOR UPDATE;

  IF v_current IS NOT NULL AND p_expected_updated_at IS NOT NULL
     AND date_trunc('milliseconds', v_current) <> date_trunc('milliseconds', p_expected_updated_at) THEN
    RAISE EXCEPTION 'setting_conflict';
  END IF;

  INSERT INTO public.app_settings(key, value, updated_at, updated_by)
  VALUES (v_key, p_value, now(), auth.uid())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = auth.uid()
  RETURNING updated_at INTO v_updated;

  PERFORM public.log_audit('app_settings', NULL, 'update',
    jsonb_build_object('key', v_key, 'before', v_before, 'after', p_value, 'reason', p_reason, 'success', true));

  RETURN jsonb_build_object('key', v_key, 'updated_at', v_updated);
END; $$;

-- ============ 6) PAYMENT RPCs ============
CREATE OR REPLACE FUNCTION public.admin_manual_verify_payment(
  p_payment_id uuid, p_reference text, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pay public.payments; pl public.plans; v_sub public.subscriptions; v_expires timestamptz; v_before jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF btrim(COALESCE(p_reason,'')) = '' THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF btrim(COALESCE(p_reference,'')) = '' THEN RAISE EXCEPTION 'reference_required'; END IF;

  SELECT * INTO pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF pay.id IS NULL THEN RAISE EXCEPTION 'payment not found'; END IF;
  IF pay.status IN ('paid','verified') THEN RAISE EXCEPTION 'payment_already_verified'; END IF;
  IF pay.status IN ('refunded','cancelled') THEN RAISE EXCEPTION 'payment_not_verifiable'; END IF;

  v_before := jsonb_build_object('status', pay.status, 'ref_id', pay.ref_id, 'paid_at', pay.paid_at);

  SELECT * INTO pl FROM public.plans WHERE id = pay.plan_id;
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = pay.user_id ORDER BY created_at DESC LIMIT 1;
  v_expires := GREATEST(COALESCE(v_sub.expires_at, now()), now()) + make_interval(months => COALESCE(pl.duration_months, 1));

  IF pay.plan_id IS NOT NULL THEN
    IF v_sub.id IS NULL THEN
      INSERT INTO public.subscriptions(user_id, plan_id, status, expires_at, created_by)
      VALUES (pay.user_id, pay.plan_id, 'active', v_expires, auth.uid()) RETURNING * INTO v_sub;
    ELSE
      UPDATE public.subscriptions SET status='active', plan_id = COALESCE(pay.plan_id, plan_id), expires_at = v_expires
      WHERE id = v_sub.id RETURNING * INTO v_sub;
    END IF;
  END IF;

  UPDATE public.payments SET
    status = 'verified',
    ref_id = COALESCE(NULLIF(btrim(p_reference), ''), ref_id),
    subscription_id = COALESCE(v_sub.id, subscription_id),
    paid_at = COALESCE(paid_at, now()),
    verified_at = now(),
    manual_verified_by = auth.uid(),
    manual_verified_at = now(),
    updated_at = now()
  WHERE id = pay.id;

  PERFORM public.log_audit('payments', pay.id, 'manual_verify',
    jsonb_build_object('before', v_before,
      'after', jsonb_build_object('status','verified','reference', p_reference),
      'reason', p_reason, 'subscription_id', v_sub.id, 'success', true));

  RETURN jsonb_build_object('ok', true, 'payment_id', pay.id, 'subscription_id', v_sub.id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_begin_refund(
  p_payment_id uuid, p_amount numeric, p_reason text, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pay public.payments; v_existing public.payment_refunds; v_remaining numeric; v_refund public.payment_refunds;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF btrim(COALESCE(p_reason,'')) = '' THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF btrim(COALESCE(p_idempotency_key,'')) = '' THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;

  SELECT * INTO v_existing FROM public.payment_refunds WHERE idempotency_key = p_idempotency_key;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('refund_id', v_existing.id, 'idempotent', true,
      'status', v_existing.status, 'amount', v_existing.amount, 'currency', v_existing.currency,
      'gateway', v_existing.provider);
  END IF;

  SELECT * INTO pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF pay.id IS NULL THEN RAISE EXCEPTION 'payment not found'; END IF;
  IF pay.status NOT IN ('paid','verified') THEN RAISE EXCEPTION 'payment_not_refundable'; END IF;

  IF EXISTS (SELECT 1 FROM public.payment_refunds WHERE payment_id = pay.id AND status = 'pending') THEN
    RAISE EXCEPTION 'refund_in_progress';
  END IF;

  v_remaining := pay.amount - COALESCE(pay.refunded_amount, 0);
  IF v_remaining <= 0 THEN RAISE EXCEPTION 'payment_already_refunded'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_refund_amount'; END IF;
  IF p_amount > v_remaining THEN RAISE EXCEPTION 'refund_amount_exceeds_remaining'; END IF;

  INSERT INTO public.payment_refunds(payment_id, amount, currency, provider, status, reason, idempotency_key, requested_by)
  VALUES (pay.id, p_amount, pay.currency, pay.gateway, 'pending', p_reason, p_idempotency_key, auth.uid())
  RETURNING * INTO v_refund;

  PERFORM public.log_audit('payments', pay.id, 'refund_requested',
    jsonb_build_object('refund_id', v_refund.id, 'amount', p_amount, 'currency', pay.currency,
      'reason', p_reason, 'idempotency_key', p_idempotency_key, 'success', true));

  RETURN jsonb_build_object('refund_id', v_refund.id, 'idempotent', false, 'status', 'pending',
    'amount', p_amount, 'currency', pay.currency, 'gateway', pay.gateway,
    'remaining', v_remaining, 'payment_amount', pay.amount);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_finalize_refund(
  p_refund_id uuid, p_success boolean, p_provider_reference text DEFAULT NULL, p_error_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_refund public.payment_refunds; pay public.payments; v_total numeric; v_status text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO v_refund FROM public.payment_refunds WHERE id = p_refund_id FOR UPDATE;
  IF v_refund.id IS NULL THEN RAISE EXCEPTION 'refund not found'; END IF;
  IF v_refund.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', v_refund.status = 'succeeded', 'idempotent', true, 'status', v_refund.status);
  END IF;

  IF p_success THEN
    SELECT * INTO pay FROM public.payments WHERE id = v_refund.payment_id FOR UPDATE;
    v_total := COALESCE(pay.refunded_amount, 0) + v_refund.amount;
    IF v_total > pay.amount THEN RAISE EXCEPTION 'refund_amount_exceeds_remaining'; END IF;
    v_status := CASE WHEN v_total >= pay.amount THEN 'refunded' ELSE pay.status END;

    UPDATE public.payments SET refunded_amount = v_total, refunded_at = now(),
      status = v_status, updated_at = now()
    WHERE id = pay.id;

    UPDATE public.payment_refunds SET status = 'succeeded',
      provider_reference = NULLIF(btrim(COALESCE(p_provider_reference,'')), ''), completed_at = now()
    WHERE id = v_refund.id;

    IF v_total >= pay.amount AND pay.subscription_id IS NOT NULL THEN
      UPDATE public.subscriptions SET status = 'cancelled', updated_at = now() WHERE id = pay.subscription_id;
    END IF;
  ELSE
    UPDATE public.payment_refunds SET status = 'failed',
      error_code = NULLIF(btrim(COALESCE(p_error_code,'')), ''), completed_at = now()
    WHERE id = v_refund.id;
  END IF;

  PERFORM public.log_audit('payments', v_refund.payment_id,
    CASE WHEN p_success THEN 'refund_succeeded' ELSE 'refund_failed' END,
    jsonb_build_object('refund_id', v_refund.id, 'amount', v_refund.amount,
      'currency', v_refund.currency, 'provider_reference', NULLIF(btrim(COALESCE(p_provider_reference,'')),''),
      'error_code', NULLIF(btrim(COALESCE(p_error_code,'')),''), 'success', p_success));

  RETURN jsonb_build_object('ok', p_success, 'idempotent', false,
    'status', CASE WHEN p_success THEN 'succeeded' ELSE 'failed' END);
END; $$;

-- ============ 7) AUDIT LIST ============
CREATE OR REPLACE FUNCTION public.admin_list_audit(
  p_search text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_entity text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_result text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total bigint; v_items jsonb; v_page int; v_size int; v_search text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_page := GREATEST(COALESCE(p_page,1), 1);
  v_size := LEAST(GREATEST(COALESCE(p_page_size,25), 1), 200);
  v_search := NULLIF(btrim(COALESCE(p_search,'')), '');

  WITH filtered AS (
    SELECT a.* FROM public.audit_logs a
    WHERE (p_actor_id IS NULL OR a.actor_id = p_actor_id)
      AND (p_action IS NULL OR a.action = p_action)
      AND (p_entity IS NULL OR a.entity = p_entity)
      AND (p_entity_id IS NULL OR a.entity_id = p_entity_id)
      AND (p_from IS NULL OR a.created_at >= p_from)
      AND (p_to IS NULL OR a.created_at <= p_to)
      AND (p_result IS NULL OR
           (p_result = 'success' AND COALESCE((a.details->>'success')::boolean, true) = true) OR
           (p_result = 'failure' AND COALESCE((a.details->>'success')::boolean, true) = false))
      AND (v_search IS NULL OR a.actor_name ILIKE '%'||v_search||'%'
           OR a.action ILIKE '%'||v_search||'%' OR a.entity ILIKE '%'||v_search||'%'
           OR COALESCE(a.details->>'reason','') ILIKE '%'||v_search||'%')
  )
  SELECT count(*) INTO v_total FROM filtered;

  WITH filtered AS (
    SELECT a.* FROM public.audit_logs a
    WHERE (p_actor_id IS NULL OR a.actor_id = p_actor_id)
      AND (p_action IS NULL OR a.action = p_action)
      AND (p_entity IS NULL OR a.entity = p_entity)
      AND (p_entity_id IS NULL OR a.entity_id = p_entity_id)
      AND (p_from IS NULL OR a.created_at >= p_from)
      AND (p_to IS NULL OR a.created_at <= p_to)
      AND (p_result IS NULL OR
           (p_result = 'success' AND COALESCE((a.details->>'success')::boolean, true) = true) OR
           (p_result = 'failure' AND COALESCE((a.details->>'success')::boolean, true) = false))
      AND (v_search IS NULL OR a.actor_name ILIKE '%'||v_search||'%'
           OR a.action ILIKE '%'||v_search||'%' OR a.entity ILIKE '%'||v_search||'%'
           OR COALESCE(a.details->>'reason','') ILIKE '%'||v_search||'%')
    ORDER BY a.created_at DESC
    LIMIT v_size OFFSET (v_page - 1) * v_size
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.created_at DESC), '[]'::jsonb) INTO v_items FROM filtered f;

  RETURN jsonb_build_object('items', v_items, 'total', v_total, 'page', v_page, 'page_size', v_size);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_audit_facets()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'actions', (SELECT COALESCE(jsonb_agg(DISTINCT action), '[]'::jsonb) FROM public.audit_logs WHERE action IS NOT NULL),
    'entities', (SELECT COALESCE(jsonb_agg(DISTINCT entity), '[]'::jsonb) FROM public.audit_logs WHERE entity IS NOT NULL),
    'actors', (SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', actor_id, 'name', actor_name)), '[]'::jsonb)
               FROM public.audit_logs WHERE actor_id IS NOT NULL)
  );
END; $$;

-- ============ 8) HEALTH + ERROR LOG RPCs ============
CREATE OR REPLACE FUNCTION public.admin_db_health()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_start timestamptz := clock_timestamp(); v_missing text[] := '{}';
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(array_agg(t), '{}') INTO v_missing FROM unnest(ARRAY[
    'profiles','plans','payments','subscriptions','app_settings','audit_logs','error_logs','payment_refunds'
  ]) AS t WHERE to_regclass('public.'||t) IS NULL;

  RETURN jsonb_build_object(
    'ok', array_length(v_missing,1) IS NULL,
    'missing_tables', to_jsonb(v_missing),
    'latency_ms', round(extract(milliseconds from clock_timestamp() - v_start)::numeric, 2),
    'checked_at', now()
  );
END; $$;

CREATE OR REPLACE FUNCTION public.admin_error_stats()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'last_24h', (SELECT count(*) FROM public.error_logs WHERE created_at > now() - interval '24 hours'),
    'last_7d', (SELECT count(*) FROM public.error_logs WHERE created_at > now() - interval '7 days'),
    'unresolved', (SELECT count(*) FROM public.error_logs WHERE resolved_at IS NULL),
    'by_severity', (SELECT COALESCE(jsonb_object_agg(severity, c), '{}'::jsonb)
                    FROM (SELECT severity, count(*) c FROM public.error_logs
                          WHERE created_at > now() - interval '24 hours' GROUP BY severity) s),
    'latest', (SELECT to_jsonb(e) FROM (
                 SELECT id, created_at, severity, source, message, error_code, operation, resolved_at
                 FROM public.error_logs ORDER BY created_at DESC LIMIT 1) e),
    'checked_at', now()
  );
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_errors(
  p_severity text DEFAULT NULL, p_source text DEFAULT NULL,
  p_unresolved_only boolean DEFAULT false, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total bigint; v_items jsonb; v_page int; v_size int;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_page := GREATEST(COALESCE(p_page,1),1);
  v_size := LEAST(GREATEST(COALESCE(p_page_size,20),1), 100);

  SELECT count(*) INTO v_total FROM public.error_logs e
   WHERE (p_severity IS NULL OR e.severity = p_severity)
     AND (p_source IS NULL OR e.source = p_source)
     AND (NOT COALESCE(p_unresolved_only,false) OR e.resolved_at IS NULL);

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_items
  FROM (
    SELECT e.id, e.created_at, e.severity, e.source, e.message, e.error_code, e.operation,
           e.correlation_id, e.metadata, e.resolved_at, e.resolution_note
    FROM public.error_logs e
    WHERE (p_severity IS NULL OR e.severity = p_severity)
      AND (p_source IS NULL OR e.source = p_source)
      AND (NOT COALESCE(p_unresolved_only,false) OR e.resolved_at IS NULL)
    ORDER BY e.created_at DESC LIMIT v_size OFFSET (v_page-1)*v_size
  ) x;

  RETURN jsonb_build_object('items', v_items, 'total', v_total, 'page', v_page, 'page_size', v_size);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_log_error(
  p_severity text, p_source text, p_message text,
  p_error_code text DEFAULT NULL, p_operation text DEFAULT NULL,
  p_correlation_id text DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.error_logs(severity, source, message, error_code, operation, user_id, correlation_id, metadata)
  VALUES (
    CASE WHEN COALESCE(p_severity,'') IN ('critical','error','warning','info') THEN p_severity ELSE 'error' END,
    left(COALESCE(NULLIF(btrim(p_source),''), 'unknown'), 60),
    left(COALESCE(NULLIF(btrim(p_message),''), 'unknown error'), 500),
    left(COALESCE(p_error_code,''), 80), left(COALESCE(p_operation,''), 120),
    auth.uid(), left(COALESCE(p_correlation_id,''), 80),
    COALESCE(p_metadata,'{}'::jsonb)
  ) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_resolve_error(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.error_logs SET resolved_at = now(), resolved_by = auth.uid(),
    resolution_note = left(COALESCE(p_note,''), 500)
  WHERE id = p_id AND resolved_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  PERFORM public.log_audit('error_logs', p_id, 'resolve', jsonb_build_object('reason', p_note, 'success', true));
  RETURN jsonb_build_object('ok', true);
END; $$;

-- ============ 9) EXECUTE grants (admin-guarded, authenticated only) ============
REVOKE EXECUTE ON FUNCTION public.admin_save_plan(uuid,text,numeric,integer,boolean,integer,text,integer,integer,jsonb,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_plan(uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_save_setting(text,jsonb,timestamptz,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_manual_verify_payment(uuid,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_begin_refund(uuid,numeric,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_finalize_refund(uuid,boolean,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_audit(text,uuid,text,text,uuid,text,timestamptz,timestamptz,integer,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_audit_facets() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_db_health() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_error_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_errors(text,text,boolean,integer,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_log_error(text,text,text,text,text,text,jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_error(uuid,text) FROM anon;