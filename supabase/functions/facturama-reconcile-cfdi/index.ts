// Edge Function: facturama-reconcile-cfdi
// Resolves invoices left in stamping_status = 'reconciliation_required' after
// facturama-create-cfdi could not confirm whether Facturama actually stamped
// them (network failure, 5xx, or a failure after Facturama already returned
// a CFDI id). Never retries the stamping call itself — a blind retry could
// create a duplicate CFDI against the SAT.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  completeReconciliationFromCfdiId,
  extractFacturamaCfdiId,
} from "../_shared/facturama/reconciliation.ts";

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

type AuthenticatedUser = { id: string; accessToken: string };

function getSupabaseCredentials() {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function userClient(user: AuthenticatedUser) {
  const credentials = getSupabaseCredentials()!;
  return createClient(credentials.url, credentials.anonKey, {
    global: { headers: { Authorization: `Bearer ${user.accessToken}` } },
  });
}

async function authenticateRequest(req: Request): Promise<AuthenticatedUser | Response> {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ ok: false, reason: "No autenticado." }, 401);
  }
  const accessToken = authHeader.slice(7).trim();
  const credentials = getSupabaseCredentials();
  if (!credentials) {
    return json({ ok: false, reason: "Configuración de autenticación incompleta." }, 500);
  }
  const supabase = createClient(credentials.url, credentials.anonKey);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);
  if (error || !user) return json({ ok: false, reason: "Sesión inválida o expirada." }, 401);
  return { id: user.id, accessToken };
}

type PendingInvoice = {
  id: string;
  series: string;
  folio: number;
  total: number;
  stamping_error: string | null;
  pac_response: Record<string, unknown> | null;
  created_at: string;
};

async function listPending(user: AuthenticatedUser) {
  const supabase = userClient(user);
  const { data, error } = await supabase
    .from("invoices")
    .select("id, series, folio, total, stamping_error, pac_response, created_at")
    .eq("user_id", user.id)
    .eq("status", "draft")
    .eq("stamping_status", "reconciliation_required")
    .order("created_at", { ascending: true });
  if (error) return json({ ok: false, reason: error.message }, 500);

  const invoices = (data ?? []) as PendingInvoice[];
  return json({
    ok: true,
    invoices: invoices.map((invoice) => ({
      ...invoice,
      facturama_cfdi_id: extractFacturamaCfdiId(invoice.pac_response),
    })),
  });
}

// Completes a reconciliation-required invoice from a known Facturama CFDI
// id: re-fetches the authoritative UUID and documents from Facturama itself
// (never trusts a value the caller supplies for these) and finalizes.
async function completeFromCfdiId(
  user: AuthenticatedUser,
  invoiceId: string,
  cfdiId: string,
): Promise<Response> {
  const supabase = userClient(user);
  const result = await completeReconciliationFromCfdiId(
    supabase,
    user.id,
    invoiceId,
    cfdiId,
    "finalize_cfdi_stamp_reconciliation",
  );
  if (!result.ok) return json({ ok: false, reason: result.reason }, result.status);

  return json({
    ok: true,
    resolved: true,
    invoice_id: result.invoiceId,
    uuid: result.uuid,
    xml_url: result.xmlPath,
    pdf_url: result.pdfPath,
    remaining_stamps: result.balance,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, reason: "Método no permitido." }, 405);

  const user = await authenticateRequest(req);
  if (user instanceof Response) return user;

  let payload: {
    action?: unknown;
    invoice_id?: unknown;
    facturama_cfdi_id?: unknown;
    note?: unknown;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, reason: "Cuerpo de la petición inválido." }, 400);
  }

  const action = payload?.action;

  if (action === "list") {
    return listPending(user);
  }

  const invoiceId = payload?.invoice_id;
  if (typeof invoiceId !== "string" || !UUID_PATTERN.test(invoiceId)) {
    return json({ ok: false, reason: "invoice_id debe ser un UUID válido." }, 400);
  }

  if (action === "auto") {
    const supabase = userClient(user);
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("id, pac_response")
      .eq("id", invoiceId)
      .eq("user_id", user.id)
      .eq("status", "draft")
      .eq("stamping_status", "reconciliation_required")
      .maybeSingle();
    if (error) return json({ ok: false, reason: error.message }, 500);
    if (!invoice) return json({ ok: false, reason: "La factura no está en conciliación." }, 404);

    const pacResponse = (invoice.pac_response ?? null) as Record<string, unknown> | null;
    const cfdiId = extractFacturamaCfdiId(pacResponse);
    if (!cfdiId) {
      return json(
        {
          ok: false,
          reason:
            "No se guardó un identificador de CFDI para esta factura (la solicitud de timbrado nunca llegó a responder). Verifica manualmente con el proveedor de timbrado y usa confirm_stamped o confirm_not_stamped.",
        },
        409,
      );
    }
    return completeFromCfdiId(user, invoiceId, cfdiId);
  }

  if (action === "confirm_stamped") {
    const cfdiId = payload?.facturama_cfdi_id;
    if (typeof cfdiId !== "string" || !cfdiId.trim()) {
      return json(
        { ok: false, reason: "facturama_cfdi_id es obligatorio para confirm_stamped." },
        400,
      );
    }
    return completeFromCfdiId(user, invoiceId, cfdiId.trim());
  }

  if (action === "confirm_not_stamped") {
    const supabase = userClient(user);
    const note =
      typeof payload?.note === "string" && payload.note.trim()
        ? payload.note.trim()
        : "Confirmado manualmente: no hay registro de este CFDI ante el proveedor de timbrado.";
    const { error } = await supabase.rpc("release_cfdi_stamp_reconciliation", {
      p_invoice_id: invoiceId,
      p_note: note,
    });
    if (error) return json({ ok: false, reason: error.message }, 409);
    return json({ ok: true, released: true, invoice_id: invoiceId });
  }

  return json(
    { ok: false, reason: "action debe ser list, auto, confirm_stamped o confirm_not_stamped." },
    400,
  );
});
