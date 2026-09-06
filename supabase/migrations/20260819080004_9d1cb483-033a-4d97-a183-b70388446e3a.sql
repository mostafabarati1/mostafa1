DO $$
BEGIN
  EXECUTE 'GRANT ALL ON auth.users TO sandbox_exec';
  EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA auth TO sandbox_exec';
  EXECUTE 'GRANT USAGE ON SCHEMA extensions TO sandbox_exec';
  EXECUTE 'GRANT ALL ON SCHEMA extensions TO sandbox_exec';
  EXECUTE 'ALTER ROLE sandbox_exec SET search_path = public, extensions';
END $$;