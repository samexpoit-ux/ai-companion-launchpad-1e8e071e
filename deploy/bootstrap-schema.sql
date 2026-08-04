-- ============================================================================
-- Nexura AI — core schema bootstrap / self-heal (applied by deploy/migrate.sh
-- BEFORE the numbered migrations run).
--
-- Fully idempotent: every statement uses IF NOT EXISTS or an exception guard,
-- so replaying it on a healthy database changes nothing.
--
-- Why it exists: a `BASELINE=1` run recorded the original migrations as applied
-- without executing them, so tables such as public.user_settings were missing
-- and later function migrations failed with
--   ERROR: type "public.user_settings" does not exist
-- ============================================================================

-- roles enum -----------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- shared updated_at helpers --------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

-- profiles -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own profile" ON public.profiles;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- user_roles -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

DROP POLICY IF EXISTS "profiles_admin_read" ON public.profiles;
CREATE POLICY "profiles_admin_read" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_admin());

-- projects -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own projects" ON public.projects;
CREATE POLICY "own projects" ON public.projects FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "projects_admin_read" ON public.projects;
CREATE POLICY "projects_admin_read" ON public.projects FOR SELECT TO authenticated
  USING (public.is_admin());

-- chat_threads ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'New chat',
  mode TEXT NOT NULL DEFAULT 'Build',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_threads TO authenticated;
GRANT ALL ON public.chat_threads TO service_role;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own threads" ON public.chat_threads;
CREATE POLICY "own threads" ON public.chat_threads FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "chat_threads_admin_read" ON public.chat_threads;
CREATE POLICY "chat_threads_admin_read" ON public.chat_threads FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE INDEX IF NOT EXISTS chat_threads_user_recent_idx
  ON public.chat_threads (user_id, last_message_at DESC);

-- chat_messages --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL DEFAULT '',
  model TEXT,
  tokens INTEGER,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own messages" ON public.chat_messages;
CREATE POLICY "own messages" ON public.chat_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "chat_messages_admin_read" ON public.chat_messages;
CREATE POLICY "chat_messages_admin_read" ON public.chat_messages FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE INDEX IF NOT EXISTS chat_messages_thread_idx ON public.chat_messages (thread_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_client_id_idx
  ON public.chat_messages (thread_id, client_id) WHERE client_id IS NOT NULL;

-- credit_ledger --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.chat_threads(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  tier TEXT NOT NULL,
  credits NUMERIC(10,3) NOT NULL DEFAULT 0,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_ledger
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS reversal_of uuid REFERENCES public.credit_ledger(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upstream_model text,
  ADD COLUMN IF NOT EXISTS input_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens integer NOT NULL DEFAULT 0;
GRANT SELECT, INSERT ON public.credit_ledger TO authenticated;
GRANT ALL ON public.credit_ledger TO service_role;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own ledger read" ON public.credit_ledger;
CREATE POLICY "own ledger read" ON public.credit_ledger FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own ledger insert" ON public.credit_ledger;
CREATE POLICY "own ledger insert" ON public.credit_ledger FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins can read every ledger row" ON public.credit_ledger;
CREATE POLICY "Admins can read every ledger row" ON public.credit_ledger
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS credit_ledger_user_created_idx
  ON public.credit_ledger (user_id, created_at DESC);

-- user_settings --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  credits_total NUMERIC(10,3) NOT NULL DEFAULT 5,
  period_start DATE NOT NULL DEFAULT current_date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_settings ALTER COLUMN credits_total SET DEFAULT 5;
GRANT SELECT, INSERT, UPDATE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own settings" ON public.user_settings;
CREATE POLICY "own settings" ON public.user_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- credit_audit_log -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ledger_id uuid REFERENCES public.credit_ledger(id) ON DELETE SET NULL,
  event text NOT NULL,
  action text,
  credits numeric NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.credit_audit_log TO authenticated;
GRANT ALL ON public.credit_audit_log TO service_role;
ALTER TABLE public.credit_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read their own audit log" ON public.credit_audit_log;
CREATE POLICY "Users can read their own audit log" ON public.credit_audit_log
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Users can append their own audit log" ON public.credit_audit_log;
CREATE POLICY "Users can append their own audit log" ON public.credit_audit_log
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND (actor_id IS NULL OR actor_id = auth.uid()));
CREATE INDEX IF NOT EXISTS credit_audit_log_user_created_idx
  ON public.credit_audit_log (user_id, created_at DESC);

-- plans ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  monthly_credits numeric NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plans_public_read" ON public.plans;
CREATE POLICY "plans_public_read" ON public.plans FOR SELECT USING (is_active OR public.is_admin());
DROP POLICY IF EXISTS "plans_admin_write" ON public.plans;
CREATE POLICY "plans_admin_write" ON public.plans FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.plans (slug, name, description, price_cents, monthly_credits, sort_order)
VALUES ('free', 'Free', 'Try Nexura AI with 5 credits a month', 0, 5, 0)
ON CONFLICT (slug) DO NOTHING;

-- payments -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_slug text,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending',
  provider text NOT NULL DEFAULT 'manual',
  provider_ref text,
  credits_granted numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_user_id_idx ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS payments_created_at_idx ON public.payments(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_own_read" ON public.payments;
CREATE POLICY "payments_own_read" ON public.payments FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());
DROP POLICY IF EXISTS "payments_admin_write" ON public.payments;
CREATE POLICY "payments_admin_write" ON public.payments FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- platform_settings ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_public boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_public_read" ON public.platform_settings;
CREATE POLICY "settings_public_read" ON public.platform_settings FOR SELECT
  USING (is_public OR public.is_admin());
DROP POLICY IF EXISTS "settings_admin_write" ON public.platform_settings;
CREATE POLICY "settings_admin_write" ON public.platform_settings FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- admin_audit_log ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target_table text,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- columns the credit/plan guard functions write to
ALTER TABLE public.admin_audit_log
  ADD COLUMN IF NOT EXISTS target_user_id uuid,
  ADD COLUMN IF NOT EXISTS detail jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON public.admin_audit_log(created_at DESC);
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_audit_read" ON public.admin_audit_log;
CREATE POLICY "admin_audit_read" ON public.admin_audit_log FOR SELECT TO authenticated
  USING (public.is_admin());
DROP POLICY IF EXISTS "admin_audit_insert" ON public.admin_audit_log;
CREATE POLICY "admin_audit_insert" ON public.admin_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- account status (suspend / reactivate) --------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS suspended_by uuid;
CREATE INDEX IF NOT EXISTS profiles_status_idx ON public.profiles(status);

-- plan mirror columns (kept in sync with the managed schema so plan migrations
-- that touch public.profiles apply cleanly on self-hosted databases too) -----
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS monthly_credit_cents integer NOT NULL DEFAULT 0;


-- Admin operators remain unlimited, but every AI request still receives a
-- ledger reservation so actual tokens, provider spend and action usage can be
-- finalized and monitored exactly like normal accounts.
CREATE OR REPLACE FUNCTION public.reserve_unlimited_usage(
  _action text,
  _tier text,
  _credits numeric,
  _model text DEFAULT NULL,
  _thread_id uuid DEFAULT NULL,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid := auth.uid();
  entry_id uuid;
  settings_row public.user_settings;
  spent numeric;
BEGIN
  IF target IS NULL OR NOT public.is_admin(target) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;
  IF _credits IS NULL OR _credits < 0 THEN
    RAISE EXCEPTION 'invalid charge amount' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_settings (user_id) VALUES (target)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO settings_row FROM public.user_settings WHERE user_id = target;

  INSERT INTO public.credit_ledger (user_id, action, tier, credits, model, thread_id, reason)
  VALUES (target, _action, _tier, _credits, _model, _thread_id, COALESCE(_reason, 'unlimited admin usage'))
  RETURNING id INTO entry_id;

  SELECT COALESCE(SUM(credits), 0) INTO spent
  FROM public.credit_ledger
  WHERE user_id = target AND created_at >= settings_row.period_start;

  RETURN jsonb_build_object(
    'id', entry_id,
    'charged', _credits,
    'plan', settings_row.plan,
    'total', settings_row.credits_total,
    'used', spent,
    'remaining', GREATEST(settings_row.credits_total - spent, 0),
    'unlimited', true
  );
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_unlimited_usage(text,text,numeric,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_unlimited_usage(text,text,numeric,text,uuid,text) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
