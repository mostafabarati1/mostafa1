CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text,
  mobile text,
  avatar_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','banned')),
  has_used_trial boolean NOT NULL DEFAULT false,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT sandbox_exec TO CURRENT_USER WITH INHERIT TRUE;
ALTER TABLE public.profiles OWNER TO sandbox_exec;