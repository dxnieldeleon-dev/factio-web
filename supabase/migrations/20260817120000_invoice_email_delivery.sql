-- Envío del CFDI por correo (Resend): metadata de entrega en la propia
-- factura. Sin CHECK — son datos informativos, no invariantes de negocio.
ALTER TABLE public.invoices
  ADD COLUMN email_sent_at timestamptz,
  ADD COLUMN email_last_error text;

-- Una factura issued es inmutable a updates directos del cliente (no existe
-- policy de UPDATE para status <> 'draft' — ver "Users update own draft
-- invoices"), así que registrar el resultado del envío de correo necesita el
-- mismo mecanismo que el resto de las mutaciones post-timbrado
-- (mark_cfdi_stamp_reconciliation_required, finalize_cfdi_cancellation,
-- etc.): una función SECURITY DEFINER angosta que solo toca estas dos
-- columnas y valida auth.uid() = user_id en su propio cuerpo.
CREATE OR REPLACE FUNCTION public.record_invoice_email_delivery(
  p_invoice_id uuid,
  p_sent boolean,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.invoices
  SET email_sent_at = CASE WHEN p_sent THEN now() ELSE email_sent_at END,
      email_last_error = CASE WHEN p_sent THEN NULL ELSE p_error END
  WHERE id = p_invoice_id
    AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_email_delivery(uuid, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_email_delivery(uuid, boolean, text) TO authenticated;
