GRANT USAGE ON SCHEMA auth TO sandbox_exec;
GRANT REFERENCES, TRIGGER, SELECT ON TABLE auth.users TO sandbox_exec;
GRANT USAGE ON SCHEMA storage TO sandbox_exec;
GRANT USAGE ON SCHEMA extensions TO sandbox_exec;