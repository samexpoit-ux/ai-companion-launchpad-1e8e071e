CREATE TABLE IF NOT EXISTS public.abuse_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'soft',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.abuse_events TO authenticated;
GRANT ALL ON public.abuse_events TO service_role;
ALTER TABLE public.abuse_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read abuse events" ON public.abuse_events;
CREATE POLICY "admins read abuse events" ON public.abuse_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS abuse_events_user_time_idx
  ON public.abuse_events(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.guard_profile_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status
      OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
      OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
      OR NEW.suspended_by IS DISTINCT FROM OLD.suspended_by)
     AND NOT public.has_role(auth.uid(), 'admin')
     AND coalesce(current_setting('nexura.system_enforcement', true), 'off') <> 'on' THEN
    NEW.status := OLD.status;
    NEW.suspended_at := OLD.suspended_at;
    NEW.suspended_reason := OLD.suspended_reason;
    NEW.suspended_by := OLD.suspended_by;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_profile_status ON public.profiles;
CREATE TRIGGER guard_profile_status
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_status();

CREATE OR REPLACE FUNCTION public.record_abuse_attempt(
  _kind text,
  _severity text DEFAULT 'soft',
  _details jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  recent int;
  hard boolean := coalesce(_severity, 'soft') = 'hard';
  reason text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.abuse_events (user_id, kind, severity, details)
  VALUES (uid, coalesce(_kind, 'unknown'), CASE WHEN hard THEN 'hard' ELSE 'soft' END,
          coalesce(_details, '{}'::jsonb));

  SELECT count(*) INTO recent
  FROM public.abuse_events
  WHERE user_id = uid AND created_at > now() - interval '10 minutes';

  IF hard OR recent >= 5 THEN
    reason := CASE WHEN hard
      THEN 'Automatic suspension: credit-system bypass detected (' || coalesce(_kind, 'unknown') || ').'
      ELSE 'Automatic suspension: ' || recent || ' blocked billable requests in 10 minutes after the credit limit was reached.'
    END;

    PERFORM set_config('nexura.system_enforcement', 'on', true);
    UPDATE public.profiles SET
      status = 'suspended',
      suspended_at = now(),
      suspended_reason = reason,
      suspended_by = NULL,
      updated_at = now()
    WHERE id = uid AND status <> 'suspended';
    PERFORM set_config('nexura.system_enforcement', 'off', true);

    INSERT INTO public.admin_audit_log (actor_id, action, target_table, target_id, target_user_id, details)
    VALUES (NULL, 'user.auto_suspended', 'profiles', uid::text, uid,
            jsonb_build_object('kind', _kind, 'severity', _severity,
                               'recent_attempts', recent, 'details', _details));

    RETURN jsonb_build_object('suspended', true, 'attempts', recent, 'reason', reason);
  END IF;

  RETURN jsonb_build_object('suspended', false, 'attempts', recent);
END $$;

REVOKE ALL ON FUNCTION public.record_abuse_attempt(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_abuse_attempt(text, text, jsonb) TO authenticated, service_role;