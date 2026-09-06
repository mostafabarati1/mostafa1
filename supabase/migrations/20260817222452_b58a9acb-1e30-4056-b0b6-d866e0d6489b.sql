DROP FUNCTION IF EXISTS public.__import_exec(text);
DROP FUNCTION IF EXISTS public.__bootstrap_exec(text);
REVOKE ALL ON SCHEMA auth FROM sandbox_exec;