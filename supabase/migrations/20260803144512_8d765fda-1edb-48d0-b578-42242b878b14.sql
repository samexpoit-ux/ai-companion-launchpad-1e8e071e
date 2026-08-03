-- Reseller coupons -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'percent' CHECK (kind IN ('percent','amount','fixed_price')),
  value NUMERIC NOT NULL DEFAULT 0 CHECK (value >= 0),
  plan_slug TEXT,
  bonus_credits INTEGER NOT NULL DEFAULT 0 CHECK (bonus_credits >= 0),
  reseller_email TEXT,
  reseller_name TEXT,
  commission_pct NUMERIC NOT NULL DEFAULT 0 CHECK (commission_pct >= 0 AND commission_pct <= 100),
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  times_redeemed INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Coupon rows carry commission and reseller data: admin-only, always.
DROP POLICY IF EXISTS "coupons_admin_all" ON public.coupons;
CREATE POLICY "coupons_admin_all" ON public.coupons FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  plan_slug TEXT,
  credits_granted INTEGER NOT NULL DEFAULT 0,
  paid_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  commission_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, user_id)
);

GRANT SELECT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "redemptions_admin_read" ON public.coupon_redemptions;
CREATE POLICY "redemptions_admin_read" ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());
DROP POLICY IF EXISTS "redemptions_admin_write" ON public.coupon_redemptions;
CREATE POLICY "redemptions_admin_write" ON public.coupon_redemptions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_idx ON public.coupon_redemptions (coupon_id);

-- Customer-safe coupon check: returns only the discount, never the reseller,
-- commission, limits or note. Rate-limit friendly (single row lookup).
CREATE OR REPLACE FUNCTION public.check_coupon(_code TEXT, _plan_slug TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE c public.coupons;
BEGIN
  IF _code IS NULL OR length(btrim(_code)) = 0 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'missing_code');
  END IF;

  SELECT * INTO c FROM public.coupons
   WHERE code = upper(btrim(_code)) AND is_active
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;
  IF c.max_redemptions IS NOT NULL AND c.times_redeemed >= c.max_redemptions THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'exhausted');
  END IF;
  IF c.plan_slug IS NOT NULL AND _plan_slug IS NOT NULL AND c.plan_slug <> _plan_slug THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'plan_mismatch');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'code', c.code,
    'kind', c.kind,
    'value', c.value,
    'plan_slug', c.plan_slug,
    'bonus_credits', c.bonus_credits
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_coupon(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_coupon(TEXT, TEXT) TO authenticated;

-- Recording a redemption is privileged: it grants credits, so only an admin
-- (or a service-role checkout worker) may call it.
CREATE OR REPLACE FUNCTION public.record_coupon_redemption(
  _code TEXT,
  _user_id UUID,
  _plan_slug TEXT,
  _credits INTEGER,
  _paid_cents INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE c public.coupons; list_cents INTEGER; commission INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO c FROM public.coupons WHERE code = upper(btrim(_code)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'coupon not found'; END IF;
  IF NOT c.is_active THEN RAISE EXCEPTION 'coupon disabled'; END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN RAISE EXCEPTION 'coupon expired'; END IF;
  IF c.max_redemptions IS NOT NULL AND c.times_redeemed >= c.max_redemptions THEN
    RAISE EXCEPTION 'coupon exhausted';
  END IF;

  SELECT price_cents INTO list_cents FROM public.plans WHERE slug = _plan_slug;
  list_cents := COALESCE(list_cents, _paid_cents);
  commission := GREATEST(0, ROUND(_paid_cents * c.commission_pct / 100.0))::INTEGER;

  INSERT INTO public.coupon_redemptions
    (coupon_id, code, user_id, plan_slug, credits_granted, paid_cents, discount_cents, commission_cents)
  VALUES
    (c.id, c.code, _user_id, _plan_slug, GREATEST(0, _credits + c.bonus_credits), GREATEST(0, _paid_cents),
     GREATEST(0, list_cents - _paid_cents), commission)
  ON CONFLICT (coupon_id, user_id) DO NOTHING;

  UPDATE public.coupons
     SET times_redeemed = times_redeemed + 1, updated_at = now()
   WHERE id = c.id;

  RETURN jsonb_build_object('ok', true, 'code', c.code,
    'credits', GREATEST(0, _credits + c.bonus_credits), 'commission_cents', commission);
END;
$$;

REVOKE ALL ON FUNCTION public.record_coupon_redemption(TEXT, UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_coupon_redemption(TEXT, UUID, TEXT, INTEGER, INTEGER) TO authenticated;

-- Refreshed credit packages: 200 / 300 / 500 / 800 at $15 / $25 / $40 / $60.
INSERT INTO public.plans (slug, name, description, price_cents, monthly_credits, sort_order, is_active)
VALUES
  ('free',    'Free',    'Every free engine we have, plus 5 build credits.',        0,     5,   0, TRUE),
  ('starter', 'Starter', 'Full build tier with smart cost routing.',             1500,  200,  1, TRUE),
  ('growth',  'Growth',  'For steady weekly shipping.',                          2500,  300,  2, TRUE),
  ('scale',   'Scale',   'Heavy multi-file work and long sessions.',             4000,  500,  3, TRUE),
  ('max',     'Max',     'Agency-grade throughput with the best price/credit.',  6000,  800,  4, TRUE)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      price_cents = EXCLUDED.price_cents,
      monthly_credits = EXCLUDED.monthly_credits,
      sort_order = EXCLUDED.sort_order,
      is_active = TRUE;

-- Retire the old 'pro' tier; existing 'pro' accounts map onto Growth.
UPDATE public.plans SET is_active = FALSE WHERE slug = 'pro';
UPDATE public.user_settings SET plan = 'growth' WHERE plan = 'pro';