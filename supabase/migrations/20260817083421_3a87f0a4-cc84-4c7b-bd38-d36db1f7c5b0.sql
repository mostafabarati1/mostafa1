CREATE OR REPLACE FUNCTION public.__setup_exec_sql(_sql text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  EXECUTE _sql;
END $$;
REVOKE ALL ON FUNCTION public.__setup_exec_sql(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.__setup_exec_sql(text) TO sandbox_exec;