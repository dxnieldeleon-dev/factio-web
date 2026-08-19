// Lógica pura para decidir qué evento de suscripción disparar en Resend
// (subscription.activated / subscription.renewed) y armar su payload — sin
// Stripe SDK, sin fetch, sin cliente de Supabase, para poder probarla con
// deno test sin mockear nada más que los valores de entrada. El llamador
// (stripe-webhook/index.ts) extrae estos valores primitivos del Invoice de
// Stripe y del registro de plan ya resuelto.

export type SubscriptionEventName = "subscription.activated" | "subscription.renewed";

// Stripe's Invoice.billing_reason: 'subscription_create' es el primer cobro
// de una suscripción nueva; 'subscription_cycle' es una renovación
// recurrente. Otros valores (subscription_update por cambio de plan,
// manual, etc.) no están en el alcance de este cambio — no disparan nada.
export function subscriptionEventForBillingReason(
  billingReason: string | null | undefined,
): SubscriptionEventName | null {
  if (billingReason === "subscription_create") return "subscription.activated";
  if (billingReason === "subscription_cycle") return "subscription.renewed";
  return null;
}

export interface SubscriptionEventPayload {
  amount: string;
  cfdi_limit: string;
  next_billing_date: string;
  plan_name: string;
  receipt_url: string;
  renewal_date: string;
}

// "$499.00 MXN" — Intl ya da el símbolo de moneda correcto para es-MX, pero
// nunca agrega el código ISO; se concatena aparte porque así lo pide el
// payload de este evento. No se reutiliza el formatAmount() ya existente en
// este archivo (usado en los mensajes de notify() in-app) para no cambiarle
// el formato a algo que ya está en producción.
export function formatAmountEsMX(amountCents: number, currency: string): string {
  const amount = amountCents / 100;
  const symbol = amount.toLocaleString("es-MX", {
    style: "currency",
    currency: currency.toUpperCase(),
  });
  return `${symbol} ${currency.toUpperCase()}`;
}

// "18 de agosto de 2026"
export function formatDateEsMX(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function buildSubscriptionEventPayload(params: {
  amountCents: number;
  currency: string;
  planName: string;
  cfdiLimit: number;
  periodStart: Date;
  periodEnd: Date;
  receiptUrl: string;
}): SubscriptionEventPayload {
  return {
    amount: formatAmountEsMX(params.amountCents, params.currency),
    cfdi_limit: `${params.cfdiLimit} CFDIs`,
    next_billing_date: formatDateEsMX(params.periodEnd),
    plan_name: params.planName,
    receipt_url: params.receiptUrl,
    renewal_date: formatDateEsMX(params.periodStart),
  };
}
