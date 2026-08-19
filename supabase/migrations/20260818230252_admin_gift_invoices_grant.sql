-- Admin gift-invoice flow (v1): the first real mutation exposed to the
-- Lovable admin panel, previously 100% read-only via get_dashboard_metrics().
-- Every piece here is deliberately narrow: a single SECURITY DEFINER RPC
-- performs the mutation, wraps it in explicit validation with clear
-- exceptions, and writes an audit row nobody but admins can read. There is
-- no general write API — companies/subscriptions/stamp_wallets RLS and
-- existing RPCs are untouched.

-- 1. New stamp_transactions.type value: 'grant_regalo' distinguishes
--    goodwill/courtesy stamp grants from routine technical adjustments
--    (grant_ajuste) in future reporting.
ALTER TABLE public.stamp_transactions DROP CONSTRAINT stamp_transactions_type_check;
ALTER TABLE public.stamp_transactions ADD CONSTRAINT stamp_transactions_type_check
  CHECK (type IN (
    'grant_renovacion',
    'grant_ajuste',
    'grant_paquete_extra',
    'consumo',
    'reversion_consumo',
    'perdida_vencimiento',
    'grant_regalo'
  ));

-- 2. Audit trail for admin-granted gift invoices. Only admins can read it;
--    there are no INSERT/UPDATE/DELETE policies for `authenticated` on
--    purpose — the only writer is admin_grant_free_invoices() below, which
--    runs as SECURITY DEFINER and bypasses RLS as the table owner.
CREATE TABLE public.admin_stamp_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  stamp_transaction_id uuid NOT NULL REFERENCES public.stamp_transactions(id),
  amount integer NOT NULL,
  reason text NOT NULL,
  granted_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_stamp_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read stamp grants" ON public.admin_stamp_grants
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Read-only company directory for the admin panel. Joins in the current
--    plan and stamp balance so the panel doesn't need separate round trips.
--    Deliberately excludes csd_cer_url/csd_key_url (fiscal signing material)
--    — there's no reason those pass through an admin panel. Non-admin
--    callers get zero rows, not an error, so the frontend can treat
--    "not admin" and "no results" the same way it already does for
--    get_dashboard_metrics().
CREATE OR REPLACE FUNCTION public.admin_list_companies(p_search text DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
  legal_name text,
  trade_name text,
  rfc text,
  email text,
  phone text,
  plan_key text,
  plan_nombre text,
  subscription_status text,
  stamp_balance integer,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    c.legal_name,
    c.trade_name,
    c.rfc,
    c.email,
    c.phone,
    p.key,
    p.nombre,
    s.status,
    w.balance,
    c.created_at
  FROM companies c
  LEFT JOIN subscriptions s ON s.company_id = c.id
  LEFT JOIN plans p ON p.id = s.plan_id
  LEFT JOIN stamp_wallets w ON w.company_id = c.id
  WHERE public.has_role(auth.uid(), 'admin'::app_role)
    AND (
      p_search IS NULL
      OR c.legal_name ILIKE '%' || p_search || '%'
      OR c.trade_name ILIKE '%' || p_search || '%'
      OR c.rfc ILIKE '%' || p_search || '%'
    )
  ORDER BY c.created_at DESC
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_list_companies(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_companies(text) TO authenticated;

-- 4. The only mutation: grants free/courtesy invoices to a company as a
--    stamp_transactions row (type = 'grant_regalo'), which the existing
--    trg_stamp_wallet_update trigger picks up to update stamp_wallets.balance
--    automatically — this function never touches the balance directly.
--    Every grant is paired with an admin_stamp_grants audit row. Validation
--    order matches the spec: role, amount bounds, reason presence, company
--    existence — each with its own explicit exception instead of a raw
--    constraint-violation error. No revert/undo path is provided by design;
--    correcting a mistaken grant is a manual reversion_consumo transaction.
CREATE OR REPLACE FUNCTION public.admin_grant_free_invoices(
  p_company_id uuid,
  p_amount integer,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_transaction_id uuid;
  v_new_balance integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 500 THEN
    RAISE EXCEPTION 'La cantidad debe ser un entero positivo de hasta 500 timbres por operación';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'El motivo es obligatorio';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Empresa no encontrada';
  END IF;

  INSERT INTO public.stamp_transactions (company_id, type, amount, reference_id)
  VALUES (p_company_id, 'grant_regalo', p_amount, null)
  RETURNING id INTO v_transaction_id;

  INSERT INTO public.admin_stamp_grants (company_id, stamp_transaction_id, amount, reason, granted_by)
  VALUES (p_company_id, v_transaction_id, p_amount, p_reason, auth.uid());

  SELECT balance INTO v_new_balance
  FROM public.stamp_wallets
  WHERE company_id = p_company_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'granted', p_amount
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_grant_free_invoices(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_free_invoices(uuid, integer, text) TO authenticated;
