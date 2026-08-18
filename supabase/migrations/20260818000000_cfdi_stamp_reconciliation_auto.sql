-- Variante service_role-only de finalize_cfdi_stamp_reconciliation, para que
-- daily-notifications-check (cron, sin sesión de usuario real) pueda
-- resolver automáticamente una factura en reconciliation_required cuando ya
-- se conoce el facturama_cfdi_id. auth.uid() siempre es NULL bajo la llave
-- service_role, así que la función original (que exige
-- user_id = auth.uid()) nunca podría usarse desde el cron — se duplica su
-- cuerpo aquí sin ese filtro, dejando status = 'draft' AND stamping_status =
-- 'reconciliation_required' como único invariante de autorización.
--
-- No se crea un equivalente de release_cfdi_stamp_reconciliation: el cron
-- nunca debe decidir por sí mismo que un CFDI no se generó (confirm_not_stamped
-- siempre requiere juicio humano) — cuando no puede resolver automáticamente,
-- solo notifica para revisión manual.
CREATE OR REPLACE FUNCTION public.finalize_cfdi_stamp_reconciliation_auto(
  p_invoice_id uuid,
  p_uuid_fiscal text,
  p_xml_url text,
  p_pdf_url text,
  p_pac_response jsonb
)
RETURNS TABLE (balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_balance integer;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.invoices
  WHERE id = p_invoice_id
    AND status = 'draft'
    AND stamping_status = 'reconciliation_required'
  FOR UPDATE;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'La factura no está en conciliación.' USING ERRCODE = 'P0001';
  END IF;

  SELECT w.balance INTO v_balance
  FROM public.stamp_wallets w
  WHERE w.company_id = v_company_id
    AND w.reserved_stamps > 0
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'No se encontró la reserva de timbre asociada a esta factura.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.invoices
  SET status = 'issued',
      uuid_fiscal = p_uuid_fiscal,
      xml_url = p_xml_url,
      pdf_url = p_pdf_url,
      issued_at = now(),
      pac_response = p_pac_response,
      stamping_status = 'completed',
      stamping_error = null
  WHERE id = p_invoice_id;

  UPDATE public.stamp_wallets
  SET reserved_stamps = GREATEST(reserved_stamps - 1, 0),
      updated_at = now()
  WHERE company_id = v_company_id;

  INSERT INTO public.stamp_transactions (company_id, type, amount, reference_id)
  VALUES (v_company_id, 'consumo', -1, p_invoice_id);

  SELECT w.balance INTO v_balance
  FROM public.stamp_wallets w
  WHERE w.company_id = v_company_id;

  RETURN QUERY SELECT v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_cfdi_stamp_reconciliation_auto(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_cfdi_stamp_reconciliation_auto(uuid, text, text, text, jsonb) TO service_role;
