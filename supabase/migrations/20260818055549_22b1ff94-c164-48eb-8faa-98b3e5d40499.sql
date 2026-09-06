CREATE OR REPLACE FUNCTION public.__bootstrap_exec_soft(p_sql text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'ok';
EXCEPTION
  WHEN duplicate_object OR duplicate_table OR duplicate_column OR duplicate_function OR duplicate_schema OR duplicate_alias THEN
    RETURN 'skip';
  WHEN others THEN
    RETURN 'error: ' || SQLSTATE || ' ' || SQLERRM;
END;
$$;
GRANT EXECUTE ON FUNCTION public.__bootstrap_exec_soft(text) TO sandbox_exec;