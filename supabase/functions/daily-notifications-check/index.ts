// Edge Function: daily-notifications-check
// Tier 2 (time-based) notifications: revisa condiciones que dependen del
// paso del tiempo, no de un evento disparado por el usuario. Se dispara una
// vez al día desde pg_cron vía pg_net (ver migración
// 20260806040000_daily_notifications_cron.sql) — nunca desde un cliente.
//
// Solo acepta la llave service_role como credencial (nunca un JWT de
// usuario) y no lee ningún parámetro del body: la lógica es fija y no
// configurable por el llamador.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notify, type NotificationKind } from "../_shared/notify.ts";
import { checkCancellationAcceptance } from "../_shared/cancellation-check.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceRoleKey);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// Evita reenviar el mismo aviso en corridas sucesivas del cron: si ya existe
// una notificación de este `kind` (y, cuando aplica, que coincide en las
// claves de `metadata` indicadas — p. ej. company_id, o company_id +
// fiscal_year cuando una sola clave no basta para distinguir el aviso)
// dentro de la ventana, no se vuelve a insertar. Ante un error de lectura se
// asume "ya enviada" — mejor perder un aviso puntual que arriesgar spam si
// esta revisión falla.
async function hasRecentNotification(params: {
  userId: string;
  kind: NotificationKind;
  windowHours: number;
  metadataMatch?: Record<string, string>;
}): Promise<boolean> {
  let query = admin
    .from("notifications")
    .select("id")
    .eq("user_id", params.userId)
    .eq("kind", params.kind)
    .gte("created_at", new Date(Date.now() - params.windowHours * HOUR_MS).toISOString());
  for (const [key, value] of Object.entries(params.metadataMatch ?? {})) {
    query = query.eq(`metadata->>${key}`, value);
  }
  const { data, error } = await query.limit(1);
  if (error) {
    console.error("daily-notifications-check: fallo revisando duplicados", {
      kind: params.kind,
      error: error.message,
    });
    return true;
  }
  return (data?.length ?? 0) > 0;
}

const CSD_EXPIRY_THRESHOLDS: Array<{ days: number; kind: NotificationKind }> = [
  { days: 60, kind: "csd_expiring_60" },
  { days: 30, kind: "csd_expiring_30" },
  { days: 7, kind: "csd_expiring_7" },
];

// Días exactos (60/30/7), no "menor a" — así cada empresa recibe cada aviso
// una sola vez por umbral en vez de todos los días mientras esté vigente.
async function checkCsdExpiring(): Promise<number> {
  const { data: companies, error } = await admin
    .from("companies")
    .select("id, user_id, legal_name, csd_valid_to")
    .not("csd_valid_to", "is", null);
  if (error) {
    console.error("daily-notifications-check: fallo consultando CSD por vencer", error.message);
    return 0;
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let sent = 0;
  for (const company of companies ?? []) {
    const validTo = new Date(company.csd_valid_to as string);
    validTo.setUTCHours(0, 0, 0, 0);
    const daysLeft = Math.round((validTo.getTime() - today.getTime()) / DAY_MS);
    const threshold = CSD_EXPIRY_THRESHOLDS.find((t) => t.days === daysLeft);
    if (!threshold) continue;

    const alreadySent = await hasRecentNotification({
      userId: company.user_id,
      kind: threshold.kind,
      windowHours: 20,
      metadataMatch: { company_id: company.id },
    });
    if (alreadySent) continue;

    await notify(admin, {
      user_id: company.user_id,
      kind: threshold.kind,
      title: `Tu CSD vence en ${threshold.days} días`,
      body: `El certificado de sello digital de ${company.legal_name} vence el ${validTo.toLocaleDateString("es-MX")}. Renuévalo en el portal del SAT antes de esa fecha para no interrumpir tu facturación.`,
      link: "/profile/fiscal",
      metadata: { company_id: company.id },
    });
    sent++;
  }
  return sent;
}

// Recordatorio semanal (no diario) mientras el onboarding siga incompleto.
async function checkOnboardingIncomplete(): Promise<number> {
  const { data: companies, error } = await admin
    .from("companies")
    .select("id, user_id")
    .eq("onboarding_completed", false)
    .lt("created_at", new Date(Date.now() - 48 * HOUR_MS).toISOString());
  if (error) {
    console.error(
      "daily-notifications-check: fallo consultando onboarding incompleto",
      error.message,
    );
    return 0;
  }

  let sent = 0;
  for (const company of companies ?? []) {
    const alreadySent = await hasRecentNotification({
      userId: company.user_id,
      kind: "onboarding_incomplete",
      windowHours: 7 * 24,
      metadataMatch: { company_id: company.id },
    });
    if (alreadySent) continue;

    await notify(admin, {
      user_id: company.user_id,
      kind: "onboarding_incomplete",
      title: "Termina de configurar tu cuenta en Factio",
      body: "Te faltan algunos datos para poder timbrar tus facturas. Termina tu configuración cuando puedas.",
      link: "/onboarding",
      metadata: { company_id: company.id },
    });
    sent++;
  }
  return sent;
}

// "20-30 días sin facturar": se dispara al cruzar los 20 días y se
// re-verifica cada 15 para no repetir el aviso a diario mientras la
// inactividad continúa.
async function checkInactivity(): Promise<number> {
  const { data: companies, error: companiesError } = await admin
    .from("companies")
    .select("id, user_id, created_at")
    .eq("onboarding_completed", true);
  if (companiesError) {
    console.error(
      "daily-notifications-check: fallo consultando companies para inactividad",
      companiesError.message,
    );
    return 0;
  }
  if (!companies?.length) return 0;

  const { data: issuedInvoices, error: invoicesError } = await admin
    .from("invoices")
    .select("company_id, issued_at")
    .eq("status", "issued")
    .in(
      "company_id",
      companies.map((c) => c.id),
    )
    .order("issued_at", { ascending: false });
  if (invoicesError) {
    console.error(
      "daily-notifications-check: fallo consultando invoices para inactividad",
      invoicesError.message,
    );
    return 0;
  }

  // El primer registro visto por company_id es el más reciente (orden
  // descendente arriba) — equivalente a MAX(issued_at) sin necesitar GROUP BY.
  const lastIssuedByCompany = new Map<string, string>();
  for (const invoice of issuedInvoices ?? []) {
    if (!invoice.company_id || !invoice.issued_at) continue;
    if (!lastIssuedByCompany.has(invoice.company_id)) {
      lastIssuedByCompany.set(invoice.company_id, invoice.issued_at);
    }
  }

  const twentyDaysAgo = Date.now() - 20 * DAY_MS;
  let sent = 0;
  for (const company of companies) {
    const lastIssuedAt = lastIssuedByCompany.get(company.id);
    // Nunca ha facturado: solo cuenta como "inactivo" si ya lleva 20+ días
    // desde que se dio de alta — evita avisar el día 1 a una cuenta nueva
    // que apenas terminó el onboarding y todavía no tuvo oportunidad de emitir nada.
    const isInactive = lastIssuedAt
      ? new Date(lastIssuedAt).getTime() < twentyDaysAgo
      : new Date(company.created_at).getTime() < twentyDaysAgo;
    if (!isInactive) continue;

    const alreadySent = await hasRecentNotification({
      userId: company.user_id,
      kind: "inactivity_reminder",
      windowHours: 15 * 24,
      metadataMatch: { company_id: company.id },
    });
    if (alreadySent) continue;

    await notify(admin, {
      user_id: company.user_id,
      kind: "inactivity_reminder",
      title: "No has facturado en un tiempo",
      body: "Cuando quieras, aquí está Factio para tu próxima factura.",
      link: "/invoices/new",
      metadata: { company_id: company.id },
    });
    sent++;
  }
  return sent;
}

const CANCEL_DEADLINE_THRESHOLDS = [30, 15, 5];

// Regla confirmada con el usuario: el plazo para cancelar un CFDI con
// aceptación del receptor vence en la fecha límite de la declaración anual
// del ejercicio fiscal en que se emitió — no un conteo fijo de días desde el
// timbrado. Personas morales (RFC de 12 caracteres): 31 de marzo del año
// siguiente. Personas físicas (RFC de 13 caracteres): 30 de abril del año
// siguiente. No contempla la excepción de facturas menores a $1,000 MXN
// (cancelables sin aceptación) — no se confirmó si aplica un plazo distinto
// para esas.
function fiscalYearCancellationDeadline(fiscalYear: number, rfc: string): Date {
  const isPersonaMoral = rfc.trim().toUpperCase().length === 12;
  return isPersonaMoral
    ? new Date(Date.UTC(fiscalYear + 1, 2, 31)) // marzo = índice 2
    : new Date(Date.UTC(fiscalYear + 1, 3, 30)); // abril = índice 3
}

// El plazo es el mismo para todas las facturas de un mismo ejercicio fiscal
// de una misma empresa, así que se notifica una sola vez por (empresa, año),
// no por factura — evita mandar decenas de avisos individuales.
async function checkCancellationDeadline(): Promise<number> {
  const { data: companies, error: companiesError } = await admin
    .from("companies")
    .select("id, user_id, rfc");
  if (companiesError) {
    console.error(
      "daily-notifications-check: fallo consultando companies para plazo de cancelación",
      companiesError.message,
    );
    return 0;
  }
  if (!companies?.length) return 0;

  const { data: invoices, error: invoicesError } = await admin
    .from("invoices")
    .select("company_id, issued_at")
    .eq("status", "issued")
    .in(
      "company_id",
      companies.map((c) => c.id),
    );
  if (invoicesError) {
    console.error(
      "daily-notifications-check: fallo consultando invoices para plazo de cancelación",
      invoicesError.message,
    );
    return 0;
  }

  const countByCompanyYear = new Map<string, number>();
  for (const invoice of invoices ?? []) {
    if (!invoice.company_id || !invoice.issued_at) continue;
    const fiscalYear = new Date(invoice.issued_at).getUTCFullYear();
    const key = `${invoice.company_id}:${fiscalYear}`;
    countByCompanyYear.set(key, (countByCompanyYear.get(key) ?? 0) + 1);
  }

  const companyById = new Map(companies.map((c) => [c.id, c]));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let sent = 0;
  for (const [key, invoiceCount] of countByCompanyYear) {
    const [companyId, fiscalYearStr] = key.split(":");
    const company = companyById.get(companyId);
    if (!company) continue;
    const fiscalYear = Number(fiscalYearStr);

    const deadline = fiscalYearCancellationDeadline(fiscalYear, company.rfc);
    const daysLeft = Math.round((deadline.getTime() - today.getTime()) / DAY_MS);
    if (!CANCEL_DEADLINE_THRESHOLDS.includes(daysLeft)) continue;

    const alreadySent = await hasRecentNotification({
      userId: company.user_id,
      kind: "cfdi_cancel_deadline",
      windowHours: 20,
      metadataMatch: { company_id: company.id, fiscal_year: String(fiscalYear) },
    });
    if (alreadySent) continue;

    await notify(admin, {
      user_id: company.user_id,
      kind: "cfdi_cancel_deadline",
      title: `El plazo para cancelar tus facturas de ${fiscalYear} vence en ${daysLeft} días`,
      body: `Tienes ${invoiceCount} factura${invoiceCount === 1 ? "" : "s"} emitida${invoiceCount === 1 ? "" : "s"} en ${fiscalYear} que ya no podrás cancelar con aceptación del receptor después del ${deadline.toLocaleDateString("es-MX")} (fecha límite de la declaración anual de ese ejercicio).`,
      link: "/history",
      metadata: { fiscal_year: fiscalYear, invoice_count: invoiceCount, company_id: company.id },
    });
    sent++;
  }
  return sent;
}

// Cancelaciones pendientes de aceptación del receptor (cancellation_status =
// 'pending') cuyo plazo esperado de 72 horas hábiles ya venció y el CFDI
// sigue vigente ante Facturama — usa la misma verificación que el botón
// manual "Verificar estado" (_shared/cancellation-check.ts), pero con
// canFinalize=false: un cliente service_role no tiene sesión de usuario real,
// así que no puede finalizar una cancelación aunque Facturama ya la confirme
// (ver comentario en checkCancellationAcceptance) — eso solo ocurre cuando
// el propio usuario verifica manualmente. Aquí solo se notifica el
// vencimiento del plazo, una vez por factura.
async function checkCancellationAcceptanceOverdue(): Promise<number> {
  const { data: invoices, error } = await admin
    .from("invoices")
    .select(
      "id, user_id, series, folio, cancellation_reason, cancellation_replacement_uuid, cancellation_requested_at, pac_response",
    )
    .eq("cancellation_status", "pending")
    .not("cancellation_requested_at", "is", null);
  if (error) {
    console.error(
      "daily-notifications-check: fallo consultando cancelaciones pendientes",
      error.message,
    );
    return 0;
  }
  if (!invoices?.length) return 0;

  let sent = 0;
  for (const invoice of invoices) {
    const outcome = await checkCancellationAcceptance(admin, invoice, { canFinalize: false });
    if (!outcome.ok) {
      console.error("daily-notifications-check: fallo verificando cancelación pendiente", {
        invoiceId: invoice.id,
        reason: outcome.reason,
      });
      continue;
    }
    if (outcome.resolved || !outcome.overdue) continue;

    const alreadySent = await hasRecentNotification({
      userId: invoice.user_id,
      kind: "cancellation_acceptance_overdue",
      windowHours: 20,
      metadataMatch: { invoice_id: invoice.id },
    });
    if (alreadySent) continue;

    const folioLabel = `${invoice.series}-${String(invoice.folio).padStart(6, "0")}`;
    await notify(admin, {
      user_id: invoice.user_id,
      kind: "cancellation_acceptance_overdue",
      title: `Venció el plazo de aceptación para la factura ${folioLabel}`,
      body: "El receptor no respondió dentro del plazo esperado de 72 horas hábiles. Verifica el estado directamente en el Buzón Tributario del SAT — Factio solo puede reflejar lo que reporte el proveedor de timbrado.",
      link: "/history",
      metadata: { invoice_id: invoice.id },
    });
    sent++;
  }
  return sent;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ ok: false, reason: "Método no permitido." }, 405);
  }

  // Único mecanismo de autorización: la llave service_role exacta. No se
  // acepta ningún JWT de usuario (aunque sea válido) ni ningún parámetro del
  // body — este job no es configurable por quien lo invoque.
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
  if (token !== serviceRoleKey) {
    return json({ ok: false, reason: "No autorizado." }, 401);
  }

  try {
    const [csdExpiring, onboardingIncomplete, inactivity, cancelDeadline, cancelAcceptanceOverdue] =
      await Promise.all([
        checkCsdExpiring(),
        checkOnboardingIncomplete(),
        checkInactivity(),
        checkCancellationDeadline(),
        checkCancellationAcceptanceOverdue(),
      ]);

    const summary = {
      csd_expiring: csdExpiring,
      onboarding_incomplete: onboardingIncomplete,
      inactivity_reminder: inactivity,
      cfdi_cancel_deadline: cancelDeadline,
      cancellation_acceptance_overdue: cancelAcceptanceOverdue,
    };
    console.log("daily-notifications-check: resumen", summary);
    return json({ ok: true, summary });
  } catch (error) {
    console.error("daily-notifications-check: fallo inesperado", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return json({ ok: false, reason: "Error inesperado ejecutando las revisiones." }, 500);
  }
});
