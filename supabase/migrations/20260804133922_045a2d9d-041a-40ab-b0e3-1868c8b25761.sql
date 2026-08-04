CREATE TABLE IF NOT EXISTS public.github_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  login text NOT NULL,
  owner text NOT NULL,
  repo text NOT NULL,
  branch text NOT NULL DEFAULT 'main',
  auto_push boolean NOT NULL DEFAULT false,
  last_commit text,
  last_pushed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, DELETE ON public.github_connections TO authenticated;
GRANT ALL ON public.github_connections TO service_role;
ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "github_connections_select_own" ON public.github_connections;
CREATE POLICY "github_connections_select_own" ON public.github_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "github_connections_delete_own" ON public.github_connections;
CREATE POLICY "github_connections_delete_own" ON public.github_connections
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Token ciphertext: server-only, no grants for authenticated.
CREATE TABLE IF NOT EXISTS public.github_connection_secrets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.github_connection_secrets TO service_role;
ALTER TABLE public.github_connection_secrets ENABLE ROW LEVEL SECURITY;
