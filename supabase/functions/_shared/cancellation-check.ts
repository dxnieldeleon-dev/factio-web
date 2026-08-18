// Verificación del estado de una cancelación de CFDI pendiente de aceptación
// del receptor — compartido entre la Edge Function manual
// (facturama-check-cancellation, invocada por el usuario) y la revisión
// automática diaria (daily-notifications-check). Nunca decide "aceptada por
// silencio" del lado de Factio: solo refleja lo que Facturama reporte vía
// getCfdi; si el plazo esperado ya venció y el CFDI sigue vigente, solo
// informa que hay que revisar el Buzón Tributario directamente.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCfdi } from "./facturama/client.ts";
import { isFacturamaError, userFacingPacMessage } from "./facturama/errors.ts";
import { notify } from "./notify.ts";

// Duplicado del helper local homónimo en facturama-cancel-cfdi/index.ts — ese
// archivo no se modifica (fuera de alcance de este cambio) y las Edge
// Functions solo importan de ../_shared, así que se repite en vez de
// refactorizar el archivo existente (mismo criterio ya usado para
// GENERIC_NATIONAL_RFC en facturama-create-cfdi/index.ts).
export function isCfdiCancelled(status: unknown): boolean {
  return typeof status === "string" && /^(canceled|cancelled|cancelado)$/i.test(status.trim());
}

const HOUR_MS = 3_600_000;
export const CANCELLATION_ACCEPTANCE_DEADLINE_HOURS = 72;

// Aproximación de "horas hábiles": excluye sábado y domingo por completo,
// sin considerar el calendario oficial de días inhábiles del SAT —
// suficiente para esta primera versión (ver restricciones del feature).
export function businessHoursElapsed(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;
  let hours = 0;
  let cursor = from.getTime();
  const end = to.getTime();
  while (cursor < end) {
    const next = Math.min(end, cursor + HOUR_MS);
    const day = new Date(cursor).getUTCDay();
    if (day !== 0 && day !== 6) hours += (next - cursor) / HOUR_MS;
    cursor = next;
  }
  return hours;
}

export interface CancellationCheckInvoice {
  id: string;
  user_id: string;
  series: string;
  folio: number;
  cancellation_reason: string | null;
  cancellation_replacement_uuid: string | null;
  cancellation_requested_at: string | null;
  pac_response: Record<string, unknown> | null;
}

export type CancellationCheckOutcome =
  | { ok: true; resolved: true; cancelled: true }
  | {
      ok: true;
      resolved: false;
      overdue: boolean;
      hours_elapsed: number;
      cancelled_at_pac?: boolean;
    }
  | { ok: false; reason: string };

export async function checkCancellationAcceptance(
  supabase: SupabaseClient,
  invoice: CancellationCheckInvoice,
  options: { canFinalize: boolean },
): Promise<CancellationCheckOutcome> {
  const facturamaId =
    (invoice.pac_response?.facturama_cfdi_id as string | undefined) ??
    ((invoice.pac_response?.create as Record<string, unknown> | undefined)?.["Id"] as
      | string
      | undefined);
  if (!facturamaId) {
    return {
      ok: false,
      reason: "La factura no conserva el identificador del CFDI requerido para verificarla.",
    };
  }

  let detail: Record<string, unknown>;
  try {
    detail = (await getCfdi(facturamaId)) as Record<string, unknown>;
  } catch (error) {
    const reason = isFacturamaError(error)
      ? userFacingPacMessage(
          error,
          "Ocurrió un problema técnico al consultar el comprobante. Intenta de nuevo en unos minutos.",
        )
      : "No fue posible consultar el comprobante.";
    return { ok: false, reason };
  }

  const cancelledAtPac = isCfdiCancelled(detail.Status);

  if (cancelledAtPac) {
    // La revisión automática (cron, cliente service_role sin sesión de
    // usuario real) no puede finalizar aquí: finalize_cfdi_cancellation
    // valida `user_id = auth.uid()` en su propio cuerpo (para que ninguna
    // mutación de una factura fiscal dependa solo del grant de ejecución), y
    // auth.uid() siempre es NULL sin un JWT de usuario real — cambiar esa
    // función o duplicar su lógica está fuera de alcance de este cambio. Solo
    // el flujo manual (JWT real, canFinalize=true) finaliza; el cron deja la
    // factura en 'pending' y el usuario la finaliza al usar "Verificar
    // estado" la próxima vez que abra la app.
    if (!options.canFinalize) {
      return {
        ok: true,
        resolved: false,
        overdue: false,
        hours_elapsed: 0,
        cancelled_at_pac: true,
      };
    }

    const folioLabel = `${invoice.series}-${String(invoice.folio).padStart(6, "0")}`;
    const { error: finalizeError } = await supabase.rpc("finalize_cfdi_cancellation", {
      p_invoice_id: invoice.id,
      p_motive: invoice.cancellation_reason,
      p_uuid_replacement: invoice.cancellation_replacement_uuid,
      p_cancelled: true,
      p_request_date: null,
      p_cancelled_at: (detail.CancelationDate as string | undefined) ?? new Date().toISOString(),
      p_pac_response: detail,
    });
    if (finalizeError) {
      return {
        ok: false,
        reason: `Se confirmó la cancelación ante el proveedor de timbrado, pero no se pudo guardar el resultado: ${finalizeError.message}`,
      };
    }

    await notify(supabase, {
      user_id: invoice.user_id,
      kind: "invoice_cancelled",
      title: `Factura ${folioLabel} cancelada`,
      body: "El SAT confirmó la cancelación de este comprobante.",
      link: `/invoices/${invoice.id}`,
      metadata: { invoice_id: invoice.id },
    });

    return { ok: true, resolved: true, cancelled: true };
  }

  const requestedAt = invoice.cancellation_requested_at
    ? new Date(invoice.cancellation_requested_at)
    : null;
  const hoursElapsed = requestedAt ? businessHoursElapsed(requestedAt, new Date()) : 0;
  const overdue = hoursElapsed >= CANCELLATION_ACCEPTANCE_DEADLINE_HOURS;
  return { ok: true, resolved: false, overdue, hours_elapsed: Math.round(hoursElapsed) };
}
