CREATE OR REPLACE FUNCTION public.__bootstrap_exec(p_sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ BEGIN EXECUTE p_sql; END $fn$;
-- skipped: GRANT to Lovable sandbox-only role 'sandbox_exec', not applicable outside Lovable Cloud
