DROP FUNCTION IF EXISTS public.__setup_exec_sql(text);
DROP FUNCTION IF EXISTS public.__bootstrap_exec(text);
DROP FUNCTION IF EXISTS public.__import_exec(text);

CREATE OR REPLACE FUNCTION public.__setup_exec_sql(p_sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ BEGIN EXECUTE p_sql; END; $f$;
CREATE OR REPLACE FUNCTION public.__bootstrap_exec(p_sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ BEGIN EXECUTE p_sql; END; $f$;
CREATE OR REPLACE FUNCTION public.__import_exec(p_sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ BEGIN EXECUTE p_sql; END; $f$;

REVOKE ALL ON FUNCTION public.__setup_exec_sql(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__bootstrap_exec(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.__import_exec(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.__setup_exec_sql(text) TO sandbox_exec;
GRANT EXECUTE ON FUNCTION public.__bootstrap_exec(text) TO sandbox_exec;
GRANT EXECUTE ON FUNCTION public.__import_exec(text) TO sandbox_exec;