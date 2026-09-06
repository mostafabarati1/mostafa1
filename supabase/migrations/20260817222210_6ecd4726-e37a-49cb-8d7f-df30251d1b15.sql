GRANT USAGE ON SCHEMA auth TO sandbox_exec;
GRANT SELECT, REFERENCES, TRIGGER ON auth.users TO sandbox_exec;
GRANT SELECT ON auth.identities TO sandbox_exec;
GRANT SELECT ON auth.sessions TO sandbox_exec;