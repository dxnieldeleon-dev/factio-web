-- Requires the new 'admin_grants' role (added in the prior migration) in
-- addition to 'admin' before admin_grant_free_invoices() will run. 'admin'
-- alone still grants full read access to the panel (get_dashboard_metrics,
-- admin_list_companies — both unchanged); 'admin_grants' is the separate,
-- individually-assignable permission for the one action with a real
-- monetary cost. Both roles are required together, and a missing role of
-- either kind surfaces the same 'No autorizado' message as before, so the
-- error never discloses which specific role is missing.
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
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND public.has_role(auth.uid(), 'admin_grants'::app_role)
  ) THEN
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
