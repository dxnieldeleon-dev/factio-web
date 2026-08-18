-- Finance wants three early-warning signals surfaced on the admin dashboard
-- ahead of the monthly close: revenue sitting in a failed-payment
-- (past_due) state that hasn't converted or churned yet, subscriptions
-- still billing today but already flagged not to renew
-- (cancel_at_period_end), and MRR broken out by plan tier instead of only
-- the aggregate total. Same computation pattern as the existing metrics —
-- on-the-fly aggregation, no new columns. Same signature, same admin check
-- as before; GRANT/REVOKE on this function are untouched by CREATE OR
-- REPLACE and are not repeated here.
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
      'suscripciones_canceladas', (SELECT count(*) FROM subscriptions WHERE status = 'canceled'),
      'monto_en_riesgo_pago_fallido', (SELECT coalesce(sum(p.precio_mxn), 0) FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.status = 'past_due'),
      'cancelaciones_programadas', (SELECT count(*) FROM subscriptions WHERE status = 'active' AND cancel_at_period_end = true),
      'mrr_por_plan', (SELECT coalesce(jsonb_object_agg(t.key, t.mrr), '{}'::jsonb) FROM (
        SELECT p.key AS key, sum(p.precio_mxn) AS mrr
        FROM subscriptions s
        JOIN plans p ON p.id = s.plan_id
        WHERE s.status = 'active'
        GROUP BY p.key
      ) t)
    )
  ELSE
    jsonb_build_object('error', 'No autorizado')
  END
$function$;
