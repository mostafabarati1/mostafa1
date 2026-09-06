CREATE OR REPLACE FUNCTION public.__bootstrap_exec(_sql text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  EXECUTE _sql;
END $$;
REVOKE ALL ON FUNCTION public.__bootstrap_exec(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.__bootstrap_exec(text) TO sandbox_exec;