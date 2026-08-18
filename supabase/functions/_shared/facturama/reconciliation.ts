// Lógica compartida para resolver una factura en stamping_status =
// 'reconciliation_required' a partir de un facturama_cfdi_id conocido —
// reutilizada por la Edge Function manual (facturama-reconcile-cfdi,
// invocada con el JWT del usuario) y por la revisión automática diaria
// (daily-notifications-check, cliente service_role). El cliente de Supabase
// se recibe como parámetro en vez de construirse aquí para que ambos
// llamadores puedan pasar el suyo (JWT de usuario o service_role).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { documentBase64, downloadCfdi, getCfdi, getCfdiUuid } from "./client.ts";
import { isFacturamaError, userFacingPacMessage } from "./errors.ts";

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s/g, ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function cfdiDocumentPath(userId: string, invoiceId: string, extension: "xml" | "pdf") {
  return `${userId}/${invoiceId}.${extension}`;
}

export async function storeCfdiDocument(
  supabase: SupabaseClient,
  userId: string,
  invoiceId: string,
  extension: "xml" | "pdf",
  contentBase64: string,
): Promise<string | { error: string }> {
  const path = cfdiDocumentPath(userId, invoiceId, extension);
  const { error } = await supabase.storage
    .from("cfdi-documents")
    .upload(path, base64ToBytes(contentBase64), {
      contentType: extension === "xml" ? "application/xml" : "application/pdf",
      upsert: true,
    });
  if (error) {
    return {
      error: `No fue posible guardar el ${extension.toUpperCase()} del CFDI: ${error.message}`,
    };
  }
  return path;
}

// Mismo criterio usado en pac_response desde facturama-create-cfdi: el id de
// Facturama puede haber quedado guardado en dos formas distintas según en
// qué paso se interrumpió el timbrado original.
export function extractFacturamaCfdiId(
  pacResponse: Record<string, unknown> | null | undefined,
): string | null {
  const direct = pacResponse?.facturama_cfdi_id;
  if (typeof direct === "string" && direct.trim()) return direct;
  const created = (pacResponse?.create as Record<string, unknown> | undefined)?.["Id"];
  if (typeof created === "string" && created.trim()) return created;
  return null;
}

export type ReconciliationCompletionResult =
  | {
      ok: true;
      invoiceId: string;
      uuid: string;
      xmlPath: string;
      pdfPath: string;
      balance: number | null;
    }
  | { ok: false; status: number; reason: string };

// Re-deriva el UUID fiscal y los documentos desde Facturama a partir de un
// facturama_cfdi_id conocido (nunca confía en un valor provisto por el
// llamador para estos datos) y finaliza la factura invocando `rpcName` — la
// variante `_auto` (service_role, sin filtro user_id = auth.uid()) o la
// original (JWT de usuario), según quién llame.
export async function completeReconciliationFromCfdiId(
  supabase: SupabaseClient,
  userId: string,
  invoiceId: string,
  cfdiId: string,
  rpcName: "finalize_cfdi_stamp_reconciliation" | "finalize_cfdi_stamp_reconciliation_auto",
): Promise<ReconciliationCompletionResult> {
  let detail;
  try {
    detail = await getCfdi(cfdiId);
  } catch (error) {
    if (isFacturamaError(error) && error.status === 404) {
      return {
        ok: false,
        status: 404,
        reason:
          "No hay registro de ese CFDI ante el proveedor de timbrado. Si confirmaste que nunca se generó, usa confirm_not_stamped.",
      };
    }
    const message = isFacturamaError(error)
      ? userFacingPacMessage(
          error,
          "Ocurrió un problema técnico al consultar el comprobante. Intenta de nuevo en unos minutos.",
        )
      : "No fue posible consultar el comprobante.";
    return { ok: false, status: 502, reason: message };
  }

  const uuid = getCfdiUuid(detail);
  if (!uuid) {
    return { ok: false, status: 502, reason: "No se recibió el UUID fiscal de ese CFDI." };
  }

  let xmlPath: string;
  let pdfPath: string;
  try {
    const [xmlResponse, pdfResponse] = await Promise.all([
      downloadCfdi(cfdiId, "xml"),
      downloadCfdi(cfdiId, "pdf"),
    ]);
    const [xmlResult, pdfResult] = await Promise.all([
      storeCfdiDocument(supabase, userId, invoiceId, "xml", documentBase64(xmlResponse)),
      storeCfdiDocument(supabase, userId, invoiceId, "pdf", documentBase64(pdfResponse)),
    ]);
    if (typeof xmlResult !== "string") return { ok: false, status: 502, reason: xmlResult.error };
    if (typeof pdfResult !== "string") return { ok: false, status: 502, reason: pdfResult.error };
    xmlPath = xmlResult;
    pdfPath = pdfResult;
  } catch (error) {
    const message = isFacturamaError(error)
      ? userFacingPacMessage(
          error,
          "Ocurrió un problema técnico al descargar los documentos del CFDI. Intenta de nuevo en unos minutos.",
        )
      : "No fue posible descargar los documentos del CFDI.";
    return { ok: false, status: 502, reason: message };
  }

  const { data: walletResult, error: finalizeError } = await supabase.rpc(rpcName, {
    p_invoice_id: invoiceId,
    p_uuid_fiscal: uuid,
    p_xml_url: xmlPath,
    p_pdf_url: pdfPath,
    p_pac_response: { detail, facturama_cfdi_id: cfdiId, reconciled: true },
  });
  if (finalizeError) {
    return {
      ok: false,
      status: 409,
      reason: `El CFDI se recuperó del proveedor de timbrado, pero no se pudo finalizar su registro: ${finalizeError.message}`,
    };
  }

  return {
    ok: true,
    invoiceId,
    uuid,
    xmlPath,
    pdfPath,
    balance: walletResult?.[0]?.balance ?? null,
  };
}
