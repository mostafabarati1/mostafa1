CREATE OR REPLACE FUNCTION public.__bootstrap_exec(_sql text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  EXECUTE _sql;
END $$;
REVOKE ALL ON FUNCTION public.__bootstrap_exec(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.__bootstrap_exec(text) TO sandbox_exec;

CREATE OR REPLACE FUNCTION public.__setup_exec_ignore(_sql text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  EXECUTE _sql;
  RETURN 'ok';
EXCEPTION WHEN duplicate_object OR duplicate_table OR duplicate_function OR duplicate_column OR duplicate_schema THEN
  RETURN 'skip';
END $$;
REVOKE ALL ON FUNCTION public.__setup_exec_ignore(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.__setup_exec_ignore(text) TO sandbox_exec;