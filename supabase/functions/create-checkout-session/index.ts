import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const appUrl = Deno.env.get("APP_URL") ?? "https://factio.lovable.app";

// La llave de Stripe determina el modo (test o live). Elegimos la columna
// de precio correcta automáticamente según el prefijo de la llave activa,
// para no depender de acordarnos de sincronizar ambos manualmente.
const isTestMode = stripeSecretKey.startsWith("sk_test_");
const priceColumn = isTestMode ? "stripe_price_id_test" : "stripe_price_id";

const corsHeaders = {
  "Access-Control-Allow-Origin": appUrl,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!stripeSecretKey) {
      return json({ success: false, error: "Falta configurar STRIPE_SECRET_KEY en los secrets de Supabase." }, 500);
    }
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ success: false, error: "Falta autenticación." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return json({ success: false, error: "Sesión inválida." }, 401);
    }
    const userId = userData.user.id;
    const userEmail = userData.user.email;

    let body: { plan_key?: string };
    try {
      body = await req.json();
    } catch {
      return json({ success: false, error: "Cuerpo de la solicitud inválido." }, 400);
    }
    const { plan_key } = body;
    if (!plan_key) {
      return json({ success: false, error: "Falta plan_key." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("id")
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();
    if (companyError) {
      return json({ success: false, error: `Error consultando la empresa: ${companyError.message}` }, 500);
    }
    if (!company) {
      return json({ success: false, error: "No se encontró tu empresa." }, 404);
    }

    const { data: plan, error: planError } = await admin
      .from("plans")
      .select(`id, nombre, ${priceColumn}`)
      .eq("key", plan_key)
      .eq("is_active", true)
      .maybeSingle();
    if (planError) {
      return json({ success: false, error: `Error consultando el plan: ${planError.message}` }, 500);
    }
    const priceId = (plan as Record<string, unknown> | null)?.[priceColumn] as string | undefined;
    if (!priceId) {
      return json({
        success: false,
        error: isTestMode
          ? "Este plan aún no tiene un precio de prueba (stripe_price_id_test) configurado."
          : "Plan no válido o sin precio de Stripe configurado.",
      }, 400);
    }

    const { data: existingSub } = await admin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("company_id", company.id)
      .maybeSingle();

    let customerId = existingSub?.stripe_customer_id ?? undefined;
    // Un customer_id de modo live no sirve en modo test y viceversa —
    // si no coincide con el modo actual, se crea uno nuevo.
    if (customerId && !customerId.match(/^cus_/)) customerId = undefined;
    if (!customerId) {
      try {
        const customer = await stripe.customers.create({
          email: userEmail ?? undefined,
          metadata: { company_id: company.id },
        });
        customerId = customer.id;
      } catch (stripeErr) {
        return json({ success: false, error: `Error de Stripe creando el cliente: ${(stripeErr as Error).message}` }, 500);
      }
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        client_reference_id: company.id,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/profile?suscripcion=exito`,
        cancel_url: `${appUrl}/profile?suscripcion=cancelada`,
        allow_promotion_codes: true,
      });
      return json({ success: true, url: session.url }, 200);
    } catch (stripeErr) {
      return json({ success: false, error: `Error de Stripe creando el checkout: ${(stripeErr as Error).message}` }, 500);
    }
  } catch (err) {
    return json({ success: false, error: `Error inesperado: ${(err as Error).message}` }, 500);
  }
});
