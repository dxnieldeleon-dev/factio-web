// Edge Function: facturama-check-cancellation
// Verifica ante Facturama si una cancelación pendiente de aceptación del
// receptor (cancellation_status = 'pending') ya fue confirmada, y finaliza
// la factura si es así. Nunca asume "aceptada por silencio" solo porque
// venció el plazo esperado de 72 horas hábiles — solo refleja lo que
// Facturama reporte (ver _shared/cancellation-check.ts).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkCancellationAcceptance } from "../_shared/cancellation-check.ts";

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
      "id, user_id, series, folio, cancellation_status, cancellation_reason, cancellation_replacement_uuid, cancellation_requested_at, pac_response",
    )
    .eq("id", payload.invoice_id)
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (invoiceError || !invoice) return json({ ok: false, reason: "Factura no encontrada." }, 404);
  if (invoice.cancellation_status !== "pending") {
    return json(
      { ok: false, reason: "Esta factura no tiene una cancelación pendiente de aceptación." },
      409,
    );
  }

  const outcome = await checkCancellationAcceptance(supabase, invoice, { canFinalize: true });
  if (!outcome.ok) return json(outcome, 502);
  return json(outcome);
});
