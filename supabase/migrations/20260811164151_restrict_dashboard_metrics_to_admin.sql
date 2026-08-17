-- RLS audit finding: get_dashboard_metrics() is SECURITY DEFINER (correctly
-- bypasses RLS to aggregate across all users) but had no authorization check
-- of its own, and `anon` had EXECUTE granted — meaning any unauthenticated
-- caller could read aggregate business metrics (MRR, invoice volume, signup
-- counts, stamp usage) via POST /rest/v1/rpc/get_dashboard_metrics with just
-- the public anon key. No app code references this function; likely dead
-- code from an early admin dashboard that was never locked down.
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
      'facturas_timbradas_mes', (SELECT count(*) FROM invoices WHERE status = 'issued' AND stamped_at >= date_trunc('month', now()))
    )
  ELSE
    jsonb_build_object('error', 'No autorizado')
  END
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics() TO authenticated;

-- notify_stamps_low() is a trigger function only meant to fire via the
-- stamp_wallets UPDATE trigger; it had implicit EXECUTE to anon/authenticated
-- with no legitimate direct-call use case. Not exploitable today (Postgres
-- rejects direct invocation of trigger functions outside trigger context),
-- but closing it as defense-in-depth, matching the precedent set in
-- 20260730170000_revoke_public_execute_wallet_functions.sql.
REVOKE EXECUTE ON FUNCTION public.notify_stamps_low() FROM PUBLIC, anon, authenticated;
