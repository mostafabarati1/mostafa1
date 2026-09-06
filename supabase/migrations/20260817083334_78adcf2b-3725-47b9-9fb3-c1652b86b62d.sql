GRANT ALL ON SCHEMA public TO sandbox_exec;
GRANT USAGE ON SCHEMA auth TO sandbox_exec;
GRANT ALL ON ALL TABLES IN SCHEMA public TO sandbox_exec;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO sandbox_exec;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO sandbox_exec;
DO $$ BEGIN
  EXECUTE 'GRANT supabase_auth_admin TO sandbox_exec';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'GRANT anon, authenticated, service_role TO sandbox_exec';
EXCEPTION WHEN OTHERS THEN NULL; END $$;