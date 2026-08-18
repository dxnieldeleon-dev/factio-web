// Tier 1 (event-driven) notifications: a thin, reusable insert helper used
// directly from the code paths that already own the relevant state
// transition (Stripe webhook, timbrado, cancelación, CSD) — no cron, no new
// infra. See supabase/migrations/20260806020000_notifications_tier1_schema.sql
// for the `notifications.link`/`metadata` and `settings.notification_preferences`
// columns this relies on.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type NotificationKind =
  | "payment_failed"
  | "payment_recovered"
  | "plan_changed"
  | "invoice_stamped"
  | "invoice_stamp_error"
  | "invoice_cancelled"
  | "invoice_cancel_rejected"
  | "stamps_low"
  | "csd_uploaded"
  // Tier 2 (cron, ver daily-notifications-check): reutilizan las mismas 4
  // categorías del Tier 1 en vez de crear una quinta — csd_expiring_* cae en
  // 'csd', onboarding_incomplete e inactivity_reminder caen en 'invoicing'.
  | "csd_expiring_60"
  | "csd_expiring_30"
  | "csd_expiring_7"
  | "onboarding_incomplete"
  | "inactivity_reminder"
  | "cfdi_cancel_deadline"
  // Distinto de cfdi_cancel_deadline (ese es el plazo anual de declaración
  // para poder cancelar en absoluto): este avisa que venció el plazo de 72
  // horas hábiles esperado para que el receptor acepte/rechace una
  // cancelación ya solicitada — ver _shared/cancellation-check.ts.
  | "cancellation_acceptance_overdue";

type NotificationCategory = "billing" | "invoicing" | "stamps" | "csd";

const CATEGORY_BY_KIND: Record<NotificationKind, NotificationCategory> = {
  payment_failed: "billing",
  payment_recovered: "billing",
  plan_changed: "billing",
  invoice_stamped: "invoicing",
  invoice_stamp_error: "invoicing",
  invoice_cancelled: "invoicing",
  invoice_cancel_rejected: "invoicing",
  stamps_low: "stamps",
  csd_uploaded: "csd",
  csd_expiring_60: "csd",
  csd_expiring_30: "csd",
  csd_expiring_7: "csd",
  onboarding_incomplete: "invoicing",
  inactivity_reminder: "invoicing",
  cfdi_cancel_deadline: "invoicing",
  cancellation_acceptance_overdue: "invoicing",
};

export interface NotifyParams {
  user_id: string;
  title: string;
  body?: string;
  kind: NotificationKind;
  link?: string;
  metadata?: Record<string, unknown>;
}

// Callers pass in whatever Supabase client they already have in scope
// (service role in stripe-webhook, the caller's user-scoped client
// elsewhere) — RLS on both `settings` and `notifications` is
// `auth.uid() = user_id`, so either client can read/write as long as
// user_id matches the authenticated user (always true for the Tier 1 call
// sites: each one notifies the same user whose action/webhook triggered it).
export async function notify(supabase: SupabaseClient, params: NotifyParams): Promise<void> {
  const category = CATEGORY_BY_KIND[params.kind];

  const { data: settingsRow, error: settingsError } = await supabase
    .from("settings")
    .select("notification_preferences")
    .eq("user_id", params.user_id)
    .maybeSingle();
  if (settingsError) {
    // No se pudo confirmar la preferencia — se notifica de todos modos
    // (todas las categorías arrancan en true por default) en vez de perder
    // el aviso por un error transitorio de lectura.
    console.error("notify: no se pudo leer notification_preferences", {
      userId: params.user_id,
      kind: params.kind,
      error: settingsError.message,
    });
  }
  const preferences = (settingsRow?.notification_preferences ?? {}) as Partial<
    Record<NotificationCategory, boolean>
  >;
  if (preferences[category] === false) return;

  const { error: insertError } = await supabase.from("notifications").insert({
    user_id: params.user_id,
    title: params.title,
    body: params.body ?? null,
    kind: params.kind,
    link: params.link ?? null,
    metadata: params.metadata ?? {},
  });
  if (insertError) {
    console.error("notify: insert falló", {
      userId: params.user_id,
      kind: params.kind,
      error: insertError.message,
    });
  }
}
