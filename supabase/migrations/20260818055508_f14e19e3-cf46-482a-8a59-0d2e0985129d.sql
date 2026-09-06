CREATE OR REPLACE FUNCTION public.__bootstrap_exec(p_sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE p_sql;
END;
$$;
GRANT EXECUTE ON FUNCTION public.__bootstrap_exec(text) TO sandbox_exec;