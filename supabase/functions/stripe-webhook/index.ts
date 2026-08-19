import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { notify } from "../_shared/notify.ts";
import {
  buildSubscriptionEventPayload,
  subscriptionEventForBillingReason,
} from "../_shared/billing/subscription-events.ts";
import { triggerEvent } from "../_shared/resend/events.ts";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });
const admin = createClient(supabaseUrl, serviceRoleKey);

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// El plan puede coincidir por su price_id de modo live o de modo test —
// así el webhook funciona sin importar en qué modo se generó el evento.
async function getPlanByPriceId(priceId: string) {
  const { data } = await admin
    .from("plans")
    .select("id, nombre, facturas_incluidas")
    .or(`stripe_price_id.eq.${priceId},stripe_price_id_test.eq.${priceId}`)
    .maybeSingle();
  return data;
}

async function resolveUserIdForCompany(companyId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("companies")
    .select("user_id")
    .eq("id", companyId)
    .maybeSingle();
  if (error) {
    console.error("stripe-webhook: no se pudo resolver user_id de company", {
      companyId,
      error: error.message,
    });
    return null;
  }
  return data?.user_id ?? null;
}

function formatAmount(amountCents: number, currency: string | null | undefined): string {
  const amount = amountCents / 100;
  try {
    return amount.toLocaleString("es-MX", {
      style: "currency",
      currency: (currency ?? "mxn").toUpperCase(),
    });
  } catch {
    return `$${amount.toFixed(2)} ${(currency ?? "MXN").toUpperCase()}`;
  }
}

// Compara el estado de la suscripción antes/después de este upsert para
// notificar solo transiciones reales — nunca en la sincronización inicial
// (existing === null, p. ej. el primer checkout), donde "cambió" no
// significa nada porque no había nada antes.
async function notifySubscriptionChange(
  companyId: string,
  existing: { status: string; plan_id: string | null } | null,
  updated: { status: string; plan_id: string | null },
  plan: { nombre: string; facturas_incluidas: number } | null,
) {
  const paymentRecovered = existing?.status === "past_due" && updated.status === "active";
  const planChanged =
    existing?.plan_id != null && updated.plan_id != null && existing.plan_id !== updated.plan_id;
  if (!paymentRecovered && !planChanged) return;

  const userId = await resolveUserIdForCompany(companyId);
  if (!userId) return;

  if (paymentRecovered) {
    await notify(admin, {
      user_id: userId,
      kind: "payment_recovered",
      title: "Pago recibido, tu suscripción está activa",
      body: "Tu método de pago se procesó correctamente y tu suscripción sigue activa.",
      link: "/profile",
    });
  }

  if (planChanged && plan) {
    await notify(admin, {
      user_id: userId,
      kind: "plan_changed",
      title: `Tu plan cambió a ${plan.nombre}`,
      body: `Tu nuevo plan incluye ${plan.facturas_incluidas} facturas por periodo.`,
      link: "/profile",
      metadata: { plan_id: updated.plan_id },
    });
  }
}

async function upsertSubscriptionFromStripe(sub: Stripe.Subscription, companyIdHint?: string) {
  const priceId = sub.items.data[0]?.price?.id;
  const plan = priceId ? await getPlanByPriceId(priceId) : null;
  if (priceId && !plan) {
    // No debería pasar con nuestros propios planes: indica que el price_id
    // de Stripe no existe en `plans` (p. ej. se cambió el precio en el
    // dashboard de Stripe sin actualizar la tabla). En un upsert esto deja
    // plan_id fuera del payload — para una fila nueva, la columna NOT NULL
    // lo rechaza (falla fuerte, correcto); para una fila existente, el
    // UPDATE simplemente no toca plan_id (silencioso). Cualquiera de los
    // dos casos merece quedar en el log en vez de adivinarse después.
    console.error("stripe-webhook: price_id de suscripción sin plan asociado", {
      subscriptionId: sub.id,
      priceId,
    });
  }

  // El estado previo (antes de este upsert) hace falta no solo para
  // resolver companyId cuando falta, sino para poder comparar y detectar
  // transiciones que ameritan notificar (pago recuperado, cambio de plan).
  let companyId = companyIdHint;
  let existing: { company_id: string; status: string; plan_id: string | null } | null = null;
  if (companyId) {
    const { data, error } = await admin
      .from("subscriptions")
      .select("company_id, status, plan_id")
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw new Error(`Lookup de subscriptions falló: ${error.message}`);
    existing = data;
  } else {
    const { data, error } = await admin
      .from("subscriptions")
      .select("company_id, status, plan_id")
      .eq("stripe_subscription_id", sub.id)
      .maybeSingle();
    if (error) throw new Error(`Lookup de subscriptions falló: ${error.message}`);
    existing = data;
    companyId = existing?.company_id;
  }
  if (!companyId) return null;

  const { data: row, error: upsertError } = await admin
    .from("subscriptions")
    .upsert(
      {
        company_id: companyId,
        plan_id: plan?.id,
        stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        stripe_subscription_id: sub.id,
        status: sub.status,
        current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        cancel_at_period_end: sub.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    )
    .select()
    .single();
  if (upsertError) throw new Error(`Upsert de subscriptions falló: ${upsertError.message}`);

  await notifySubscriptionChange(companyId, existing, row, plan);
  return row;
}

// Stripe deprecated the top-level Invoice.subscription field in favor of
// invoice.parent.subscription_details.subscription for API versions newer
// than the one this SDK client is pinned to (2024-06-20) — the Stripe
// dashboard's webhook endpoint can be configured to serialize events at the
// account's current default version regardless of what apiVersion the SDK
// uses for outbound calls, so the newer shape can show up here even though
// we never asked for it. Falling back covers both.
function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | undefined {
  if (typeof invoice.subscription === "string") return invoice.subscription;
  if (invoice.subscription?.id) return invoice.subscription.id;
  const parent = (
    invoice as unknown as {
      parent?: { subscription_details?: { subscription?: string | { id: string } | null } };
    }
  ).parent;
  const nested = parent?.subscription_details?.subscription;
  return typeof nested === "string" ? nested : nested?.id;
}

// Postgres unique_violation — the (company_id, type, reference_id) index that
// makes granting idempotent under Stripe's at-least-once webhook delivery.
const UNIQUE_VIOLATION = "23505";

async function grantForInvoice(invoice: Stripe.Invoice) {
  const subId = subscriptionIdFromInvoice(invoice);
  if (!subId) return;

  const { data: subRow, error: subError } = await admin
    .from("subscriptions")
    .select("id, company_id, plan_id")
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  if (subError) throw new Error(`Lookup de subscriptions falló: ${subError.message}`);
  if (!subRow) return;

  const priceId = invoice.lines.data[0]?.price?.id;
  const plan = priceId ? await getPlanByPriceId(priceId) : null;
  const facturasIncluidas = plan?.facturas_incluidas;
  if (!plan || !facturasIncluidas) {
    // Sin este log, este caso quedaba en silencio total: la función
    // regresaba 200 (Stripe nunca reintenta un 200), así que un pago real
    // sin plan resoluble se traducía en cero timbres otorgados y nada en
    // ningún lado que lo señalara — así fue como se tuvo que detectar y
    // corregir a mano la última vez.
    console.error("stripe-webhook: factura pagada sin plan resoluble, no se otorgaron timbres", {
      invoiceId: invoice.id,
      subscriptionId: subId,
      priceId,
    });
    return;
  }

  const { data: wallet, error: walletError } = await admin
    .from("stamp_wallets")
    .select("balance")
    .eq("company_id", subRow.company_id)
    .maybeSingle();
  if (walletError) throw new Error(`Lookup de stamp_wallets falló: ${walletError.message}`);
  const currentBalance = wallet?.balance ?? 0;

  if (currentBalance > 0) {
    const { error: expiryError } = await admin.from("stamp_transactions").insert({
      company_id: subRow.company_id,
      subscription_id: subRow.id,
      type: "perdida_vencimiento",
      amount: -currentBalance,
      reference_id: `${invoice.id}_expiry`,
    });
    if (expiryError && expiryError.code !== UNIQUE_VIOLATION) {
      throw new Error(`Insert de perdida_vencimiento falló: ${expiryError.message}`);
    }
  }

  const { error: grantError } = await admin.from("stamp_transactions").insert({
    company_id: subRow.company_id,
    subscription_id: subRow.id,
    type: "grant_renovacion",
    amount: facturasIncluidas,
    reference_id: invoice.id,
  });
  // A unique violation here means this exact invoice was already granted —
  // Stripe redelivered the same event, not a new payment. Treat as success.
  if (grantError && grantError.code !== UNIQUE_VIOLATION) {
    throw new Error(`Insert de grant_renovacion falló: ${grantError.message}`);
  }

  // Solo se dispara el correo de suscripción (activated/renewed) en el
  // otorgamiento genuinamente nuevo — nunca en una redelivery de Stripe del
  // mismo invoice, o el cliente recibiría el mismo correo de confirmación
  // dos veces.
  if (!grantError) {
    await dispatchSubscriptionEvent(subRow.company_id, invoice, plan);
  }
}

// Dispara subscription.activated/subscription.renewed a la API de eventos de
// Resend (plantillas y automatizaciones ya configuradas del lado de Resend,
// ver _shared/resend/events.ts) y deja un registro durable en
// billing_receipts para que receipt_url apunte a una página real de la app.
// Nunca debe bloquear el registro del pago: el timbre ya se otorgó antes de
// llamar esta función, así que cualquier falla aquí (Resend caído, correo
// del usuario no resoluble, etc.) solo se registra en logs.
async function dispatchSubscriptionEvent(
  companyId: string,
  invoice: Stripe.Invoice,
  plan: { nombre: string; facturas_incluidas: number },
) {
  const eventName = subscriptionEventForBillingReason(invoice.billing_reason);
  if (!eventName) return;

  try {
    const line = invoice.lines.data[0];
    const periodStart = new Date((line?.period?.start ?? invoice.created) * 1000);
    const periodEnd = new Date((line?.period?.end ?? invoice.created) * 1000);
    const kind = eventName === "subscription.activated" ? "activation" : "renewal";

    const { data: receipt, error: receiptError } = await admin
      .from("billing_receipts")
      .insert({
        company_id: companyId,
        stripe_invoice_id: invoice.id,
        kind,
        plan_name: plan.nombre,
        cfdi_limit: plan.facturas_incluidas,
        amount_cents: invoice.amount_paid,
        currency: invoice.currency,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
      })
      .select("id")
      .single();
    if (receiptError) {
      // Mismo criterio que grant_renovacion arriba: un unique_violation en
      // stripe_invoice_id significa que este invoice ya se procesó antes.
      if (receiptError.code === UNIQUE_VIOLATION) return;
      throw new Error(`Insert de billing_receipts falló: ${receiptError.message}`);
    }

    const userId = await resolveUserIdForCompany(companyId);
    if (!userId) return;
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !userData.user?.email) {
      console.error(
        "stripe-webhook: no se pudo resolver el correo para el evento de suscripción",
        { userId, error: userError?.message },
      );
      return;
    }

    const appUrl = Deno.env.get("APP_URL") ?? "https://factio.lovable.app";
    const payload = buildSubscriptionEventPayload({
      amountCents: invoice.amount_paid,
      currency: invoice.currency,
      planName: plan.nombre,
      cfdiLimit: plan.facturas_incluidas,
      periodStart,
      periodEnd,
      receiptUrl: `${appUrl}/profile/receipts/${receipt.id}`,
    });

    await triggerEvent({ event: eventName, email: userData.user.email, payload });
  } catch (err) {
    console.error("stripe-webhook: fallo disparando evento de suscripción a Resend", {
      invoiceId: invoice.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

Deno.serve(async (req: Request) => {
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  if (!signature) {
    return json({ error: "Falta firma de Stripe." }, 400);
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    return json({ error: `Firma inválida: ${(err as Error).message}` }, 400);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.client_reference_id ?? undefined;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (companyId && subscriptionId) {
          let sub: Stripe.Subscription;
          try {
            sub = await stripe.subscriptions.retrieve(subscriptionId);
          } catch (stripeErr) {
            throw new Error(
              `No se pudo obtener de Stripe la suscripción ${subscriptionId}: ${(stripeErr as Error).message}`,
            );
          }
          await upsertSubscriptionFromStripe(sub, companyId);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscriptionFromStripe(sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await admin
          .from("subscriptions")
          .update({ status: "canceled", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id);
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        await grantForInvoice(invoice);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = subscriptionIdFromInvoice(invoice);
        if (subId) {
          const { data: updatedSub, error: updateError } = await admin
            .from("subscriptions")
            .update({ status: "past_due", updated_at: new Date().toISOString() })
            .eq("stripe_subscription_id", subId)
            .select("company_id")
            .maybeSingle();
          if (updateError) {
            console.error("stripe-webhook: no se pudo marcar past_due", {
              subId,
              error: updateError.message,
            });
          } else if (updatedSub?.company_id) {
            const userId = await resolveUserIdForCompany(updatedSub.company_id);
            if (userId) {
              await notify(admin, {
                user_id: userId,
                kind: "payment_failed",
                title: "Pago de suscripción fallido",
                body: `No pudimos cobrar ${formatAmount(invoice.amount_due, invoice.currency)}. Actualiza tu método de pago para no perder acceso a la facturación.`,
                link: "/profile",
                metadata: { invoice_id: invoice.id, amount_due: invoice.amount_due },
              });
            }
          }
        }
        break;
      }
      default:
        break;
    }
    return json({ received: true }, 200);
  } catch (err) {
    // Stripe retries on 5xx, but retries alone never fix a code bug — log
    // enough (event type/id, message, stack) that a repeat failure is
    // diagnosable straight from logs instead of reverse-engineering it from
    // which DB rows are missing, like this one had to be.
    console.error("stripe-webhook error", {
      eventType: event.type,
      eventId: event.id,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return json({ error: "Error interno procesando el evento." }, 500);
  }
});
