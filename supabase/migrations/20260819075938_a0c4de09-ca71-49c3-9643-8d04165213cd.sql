DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'GRANT ALL ON SCHEMA public TO sandbox_exec';
    EXECUTE 'GRANT USAGE ON SCHEMA auth TO sandbox_exec';
    EXECUTE 'GRANT SELECT ON auth.users TO sandbox_exec';
    EXECUTE 'GRANT anon, authenticated, service_role TO sandbox_exec WITH ADMIN OPTION';
    EXECUTE 'ALTER ROLE sandbox_exec CREATEROLE';
  END IF;
END $$;