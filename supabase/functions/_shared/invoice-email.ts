// Cuerpo compartido del envío de copia por correo de un CFDI ya timbrado —
// usado tanto por el disparo automático (facturama-create-cfdi, justo
// después de finalize_cfdi_stamp) como por el botón manual de
// enviar/reenviar (Edge Function send-invoice-email). Nunca lanza: siempre
// registra el resultado en la factura vía record_invoice_email_delivery y
// devuelve { ok, reason? } — el llamador decide qué hacer con el resultado,
// pero un fallo aquí nunca debe abortar el flujo que lo invoca (timbrado o
// respuesta de la función manual).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "./resend/client.ts";
import { isResendError, userFacingResendMessage } from "./resend/errors.ts";

const CFDI_BUCKET = "cfdi-documents";

export interface InvoiceEmailInput {
  invoiceId: string;
  folioLabel: string;
  total: number;
  currency: string;
  companyName: string;
  clientName: string;
  clientEmail: string;
  xmlPath: string;
  pdfPath: string;
}

export interface InvoiceEmailOutcome {
  ok: boolean;
  reason?: string;
}

function isExternalUrl(value: string): boolean {
  return /^(https?:|data:)/i.test(value);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Server-side equivalent of resolveInvoiceDocumentUrl (src/lib/invoice-documents.ts):
// current documents are private-storage paths, but legacy rows may still
// carry an external URL — handled the same way there.
async function downloadAttachment(supabase: SupabaseClient, pathOrUrl: string): Promise<string> {
  if (isExternalUrl(pathOrUrl)) {
    const response = await fetch(pathOrUrl);
    if (!response.ok) {
      throw new Error("No fue posible descargar el archivo del comprobante.");
    }
    return toBase64(new Uint8Array(await response.arrayBuffer()));
  }

  const { data, error } = await supabase.storage.from(CFDI_BUCKET).download(pathOrUrl);
  if (error || !data) {
    throw new Error(`No fue posible descargar el archivo del comprobante (${pathOrUrl}).`);
  }
  return toBase64(new Uint8Array(await data.arrayBuffer()));
}

function moneyLabel(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(value);
  } catch {
    // Unrecognized currency code — fall back to a plain number.
    return `${value.toFixed(2)} ${currency}`;
  }
}

function buildHtml(input: InvoiceEmailInput): string {
  const greeting = input.clientName ? `Hola ${input.clientName},` : "Hola,";
  return `<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; line-height: 1.5;">
  <p>${greeting}</p>
  <p>Adjuntamos tu factura <strong>${input.folioLabel}</strong> de <strong>${input.companyName}</strong> por un total de <strong>${moneyLabel(input.total, input.currency)}</strong>.</p>
  <p>Este correo incluye el PDF y el XML de tu Comprobante Fiscal Digital por Internet (CFDI).</p>
  <p>Gracias por tu preferencia.</p>
</div>`;
}

export function resolveClientEmail(
  clientEmail: string | null | undefined,
  snapshot: Record<string, unknown> | null,
): string | null {
  if (clientEmail && clientEmail.trim()) return clientEmail.trim();
  const snapEmail = snapshot?.email;
  return typeof snapEmail === "string" && snapEmail.trim() ? snapEmail.trim() : null;
}

export async function sendInvoiceEmailAndRecord(
  supabase: SupabaseClient,
  input: InvoiceEmailInput,
): Promise<InvoiceEmailOutcome> {
  try {
    const [pdfBase64, xmlBase64] = await Promise.all([
      downloadAttachment(supabase, input.pdfPath),
      downloadAttachment(supabase, input.xmlPath),
    ]);

    await sendEmail({
      to: [input.clientEmail],
      subject: `Factura ${input.folioLabel} — ${input.companyName}`,
      html: buildHtml(input),
      attachments: [
        { filename: `Factura-${input.folioLabel}.pdf`, content: pdfBase64 },
        { filename: `Factura-${input.folioLabel}.xml`, content: xmlBase64 },
      ],
    });

    await supabase.rpc("record_invoice_email_delivery", {
      p_invoice_id: input.invoiceId,
      p_sent: true,
      p_error: null,
    });
    return { ok: true };
  } catch (error) {
    const message = isResendError(error)
      ? userFacingResendMessage(
          error,
          "Ocurrió un problema técnico al enviar el correo. Intenta de nuevo en unos minutos.",
        )
      : error instanceof Error
        ? error.message
        : "No fue posible enviar el correo.";

    console.error("Unable to send invoice email", {
      invoiceId: input.invoiceId,
      error: isResendError(error)
        ? { status: error.status, message: error.message, body: error.body }
        : error instanceof Error
          ? { message: error.message, stack: error.stack }
          : String(error),
    });

    try {
      await supabase.rpc("record_invoice_email_delivery", {
        p_invoice_id: input.invoiceId,
        p_sent: false,
        p_error: message,
      });
    } catch {
      // Best-effort bookkeeping; never mask the original error below.
    }

    return { ok: false, reason: message };
  }
}
