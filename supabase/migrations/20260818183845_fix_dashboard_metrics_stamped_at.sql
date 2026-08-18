-- get_dashboard_metrics() (20260811164151_restrict_dashboard_metrics_to_admin.sql)
-- referenced invoices.stamped_at, a column that does not exist in the schema
-- — the real issuance-date column on public.invoices is issued_at. This is
-- why the function was described as dead code in that same migration: it
-- could never actually be called without erroring. Fixes the column
-- reference and adds subscriptions_activas/canceladas counts for an
-- internal admin dashboard (separate Lovable project) that consumes this
-- RPC. Same signature, same admin check, same GRANT/REVOKE as before —
-- unchanged here.
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.has_role(auth.uid(), 'admin'::app_role) THEN
    jsonb_build_object(
      'fecha', now()::date,
      'mrr', (SELECT coalesce(sum(p.precio_mxn), 0) FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.status = 'active'),
      'timbres_usados_mes', (SELECT coalesce(sum(abs(amount)), 0) FROM stamp_transactions WHERE type = 'consumo' AND created_at >= date_trunc('month', now())),
      'timbres_disponibles', (SELECT coalesce(sum(balance), 0) FROM stamp_wallets),
      'usuarios_beta_activos', (SELECT count(*) FROM companies WHERE onboarding_completed = true),
      'nuevos_registros_semana', (SELECT count(*) FROM companies WHERE created_at >= now() - interval '7 days'),
      'facturas_timbradas_mes', (SELECT count(*) FROM invoices WHERE status = 'issued' AND issued_at >= date_trunc('month', now())),
      'suscripciones_activas', (SELECT count(*) FROM subscriptions WHERE status = 'active'),
      'suscripciones_canceladas', (SELECT count(*) FROM subscriptions WHERE status = 'canceled')
    )
  ELSE
    jsonb_build_object('error', 'No autorizado')
  END
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics() TO authenticated;
