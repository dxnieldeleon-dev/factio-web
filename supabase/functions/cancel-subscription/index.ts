import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const appUrl = Deno.env.get("APP_URL") ?? "https://factio.lovable.app";

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
      return json(
        { success: false, error: "Falta configurar STRIPE_SECRET_KEY en los secrets de Supabase." },
        500,
      );
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

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("id")
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();
    if (companyError) {
      return json(
        { success: false, error: `Error consultando la empresa: ${companyError.message}` },
        500,
      );
    }
    if (!company) {
      return json({ success: false, error: "No se encontró tu empresa." }, 404);
    }

    const { data: sub, error: subError } = await admin
      .from("subscriptions")
      .select("id, status, stripe_subscription_id, cancel_at_period_end, current_period_end")
      .eq("company_id", company.id)
      .maybeSingle();
    if (subError) {
      return json(
        { success: false, error: `Error consultando la suscripción: ${subError.message}` },
        500,
      );
    }
    if (!sub?.stripe_subscription_id) {
      return json({ success: false, error: "No tienes una suscripción activa." }, 404);
    }
    if (sub.status !== "active" && sub.status !== "trialing") {
      return json({ success: false, error: "Tu suscripción ya no está activa." }, 409);
    }
    if (sub.cancel_at_period_end) {
      return json(
        { success: true, current_period_end: sub.current_period_end, already_cancelled: true },
        200,
      );
    }

    let updated: Stripe.Subscription;
    try {
      updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
    } catch (stripeErr) {
      return json(
        {
          success: false,
          error: `Error de Stripe cancelando la suscripción: ${(stripeErr as Error).message}`,
        },
        500,
      );
    }

    // Optimistic local update so the UI reflects this immediately — the
    // stripe-webhook's customer.subscription.updated handler will also sync
    // this shortly, but we don't want the button state to depend on that
    // round-trip landing before the user navigates away.
    const { error: updateError } = await admin
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        current_period_end: new Date(updated.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);
    if (updateError) {
      console.error("No se pudo actualizar subscriptions localmente tras cancelar en Stripe", {
        subscriptionId: sub.id,
        error: updateError.message,
      });
    }

    return json(
      {
        success: true,
        current_period_end: new Date(updated.current_period_end * 1000).toISOString(),
      },
      200,
    );
  } catch (err) {
    return json({ success: false, error: `Error inesperado: ${(err as Error).message}` }, 500);
  }
});
