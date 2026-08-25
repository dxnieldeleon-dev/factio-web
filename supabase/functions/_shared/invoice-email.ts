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

// Mismo esquema visual que las plantillas ya publicadas en Resend (Factio -
// Confirmación de correo / Confirmación de pago): header navy (#052659) con
// logo, tarjeta blanca redondeada, tarjeta de resumen gris (#f9fafb),
// Arial/Helvetica, footer "Factio · Facturación CFDI simplificada". Se
// mantiene inline y basado en tablas por compatibilidad con clientes de
// correo (Outlook, Gmail, etc.) — igual que las plantillas de Resend.
const FACTIO_LOGO_URL = "https://fziszuqxogariodpbbcx.supabase.co/storage/v1/object/public/branding/2.png";

function buildHtml(input: InvoiceEmailInput): string {
  const greeting = input.clientName ? `Hola ${input.clientName},` : "Hola,";
  const totalLabel = moneyLabel(input.total, input.currency);

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
    <title>Tu factura ${input.folioLabel}</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f4f4f5;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f5">
      <tr>
        <td align="center" style="padding-top:40px; padding-bottom:40px;">
          <table
            width="600"
            cellpadding="0"
            cellspacing="0"
            border="0"
            bgcolor="#ffffff"
            style="max-width:600px; width:100%; border-radius:8px; overflow:hidden;"
          >
            <!-- Header -->
            <tr>
              <td align="center" bgcolor="#052659" style="padding-top:32px; padding-bottom:32px;">
                <img
                  src="${FACTIO_LOGO_URL}"
                  width="120"
                  height="120"
                  border="0"
                  alt="Factio"
                  style="display:block; width:120px; height:120px;"
                />
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:40px 40px 8px 40px;">
                <p
                  style="margin:0 0 16px 0; font-family: Arial, Helvetica, sans-serif; font-size:20px; line-height:28px; color:#111827; font-weight:bold;"
                >
                  Tu factura está lista
                </p>
                <p
                  style="margin:0 0 24px 0; font-family: Arial, Helvetica, sans-serif; font-size:15px; line-height:24px; color:#374151;"
                >
                  ${greeting} adjuntamos tu factura <strong>${input.folioLabel}</strong> de <strong>${input.companyName}</strong>. Este correo incluye el PDF y el XML de tu Comprobante Fiscal Digital por Internet (CFDI).
                </p>
              </td>
            </tr>

            <!-- Invoice summary card -->
            <tr>
              <td style="padding:0 40px 24px 40px;">
                <table
                  width="100%"
                  cellpadding="0"
                  cellspacing="0"
                  border="0"
                  bgcolor="#f9fafb"
                  style="border-radius:8px;"
                >
                  <tr>
                    <td style="padding:24px;">
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td
                            style="padding-bottom:12px; font-family: Arial, Helvetica, sans-serif; font-size:14px; line-height:20px; color:#6b7280;"
                          >
                            Factura
                          </td>
                          <td
                            align="right"
                            style="padding-bottom:12px; font-family: Arial, Helvetica, sans-serif; font-size:14px; line-height:20px; color:#111827; font-weight:bold;"
                          >
                            ${input.folioLabel}
                          </td>
                        </tr>
                        <tr>
                          <td
                            style="padding-bottom:12px; font-family: Arial, Helvetica, sans-serif; font-size:14px; line-height:20px; color:#6b7280;"
                          >
                            Emisor
                          </td>
                          <td
                            align="right"
                            style="padding-bottom:12px; font-family: Arial, Helvetica, sans-serif; font-size:14px; line-height:20px; color:#111827;"
                          >
                            ${input.companyName}
                          </td>
                        </tr>
                        <tr>
                          <td
                            style="font-family: Arial, Helvetica, sans-serif; font-size:14px; line-height:20px; color:#6b7280;"
                          >
                            Total
                          </td>
                          <td
                            align="right"
                            style="font-family: Arial, Helvetica, sans-serif; font-size:14px; line-height:20px; color:#111827; font-weight:bold;"
                          >
                            ${totalLabel}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Divider -->
            <tr>
              <td style="padding:0 40px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="border-top:1px solid #e5e7eb; font-size:1px; line-height:1px;">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Footer note -->
            <tr>
              <td style="padding:24px 40px 40px 40px;">
                <p
                  style="margin:0; font-family: Arial, Helvetica, sans-serif; font-size:13px; line-height:20px; color:#9ca3af;"
                >
                  Gracias por tu preferencia. ¿Tienes dudas sobre esta factura? Responde este correo y te ayudamos.
                </p>
              </td>
            </tr>
          </table>

          <!-- Outer footer -->
          <table
            width="600"
            cellpadding="0"
            cellspacing="0"
            border="0"
            style="max-width:600px; width:100%; padding-top:24px;"
          >
            <tr>
              <td align="center">
                <p
                  style="margin:0; font-family: Arial, Helvetica, sans-serif; font-size:12px; line-height:18px; color:#9ca3af;"
                >
                  Factio &middot; Facturación CFDI simplificada
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
