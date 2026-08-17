// Edge Function: send-invoice-email
// Envía (o reenvía) por correo la copia de un CFDI ya timbrado, con el PDF y
// el XML como adjuntos. Disparado manualmente desde invoices.$id.tsx; la
// misma lógica de envío (_shared/invoice-email.ts) también se dispara
// automáticamente al timbrar desde facturama-create-cfdi.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveClientEmail, sendInvoiceEmailAndRecord } from "../_shared/invoice-email.ts";

const allowedOrigin = Deno.env.get("APP_URL") ?? "https://factio.lovable.app";
const cors = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, reason: "Método no permitido." }, 405);

  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return json({ ok: false, reason: "No autenticado." }, 401);
  }
  const token = authHeader.slice(7).trim();
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey || !token) {
    return json({ ok: false, reason: "Configuración incompleta." }, 500);
  }

  const auth = createClient(url, anonKey);
  const { data: authData, error: authError } = await auth.auth.getUser(token);
  if (authError || !authData.user) return json({ ok: false, reason: "Sesión inválida." }, 401);

  let payload: { invoice_id?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, reason: "Cuerpo de la petición inválido." }, 400);
  }
  if (typeof payload.invoice_id !== "string" || !UUID_PATTERN.test(payload.invoice_id)) {
    return json({ ok: false, reason: "invoice_id debe ser un UUID válido." }, 400);
  }

  // Las consultas conservan el JWT del usuario: RLS y el filtro explícito de
  // user_id son defensas complementarias, mismo patrón que el resto de las
  // Edge Functions del proyecto.
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "id, user_id, company_id, client_id, client_snapshot, series, folio, status, total, currency, xml_url, pdf_url",
    )
    .eq("id", payload.invoice_id)
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (invoiceError || !invoice) return json({ ok: false, reason: "Factura no encontrada." }, 404);
  if (invoice.status !== "issued" || !invoice.pdf_url || !invoice.xml_url) {
    return json(
      {
        ok: false,
        reason:
          "Solo se puede enviar por correo una factura timbrada con sus archivos disponibles.",
      },
      409,
    );
  }

  const snapshot =
    invoice.client_snapshot && typeof invoice.client_snapshot === "object"
      ? (invoice.client_snapshot as Record<string, unknown>)
      : null;

  let clientEmail: string | null = null;
  let clientName: string | null = null;
  if (invoice.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("email, legal_name")
      .eq("id", invoice.client_id)
      .eq("user_id", authData.user.id)
      .maybeSingle();
    clientEmail = client?.email ?? null;
    clientName = client?.legal_name ?? null;
  }
  clientEmail = resolveClientEmail(clientEmail, snapshot);
  if (!clientName && typeof snapshot?.legal_name === "string") clientName = snapshot.legal_name;

  if (!clientEmail) {
    return json(
      { ok: false, reason: "El cliente de esta factura no tiene un correo capturado." },
      400,
    );
  }

  const { data: company } = await supabase
    .from("companies")
    .select("legal_name")
    .eq("id", invoice.company_id)
    .eq("user_id", authData.user.id)
    .maybeSingle();

  const folioLabel = `${invoice.series}-${String(invoice.folio).padStart(6, "0")}`;

  const result = await sendInvoiceEmailAndRecord(supabase, {
    invoiceId: invoice.id,
    folioLabel,
    total: Number(invoice.total),
    currency: invoice.currency ?? "MXN",
    companyName: company?.legal_name ?? "Factio",
    clientName: clientName ?? "",
    clientEmail,
    xmlPath: invoice.xml_url,
    pdfPath: invoice.pdf_url,
  });

  if (!result.ok) return json({ ok: false, reason: result.reason }, 502);
  return json({ ok: true });
});
