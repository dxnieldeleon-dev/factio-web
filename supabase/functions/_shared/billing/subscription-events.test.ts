// Corre con `deno test supabase/functions/_shared` (ver deno.json en
// supabase/functions/). Runtime distinto de Vitest a propósito — este
// módulo vive en las Edge Functions (Deno), no en el frontend (Node/Vite).

import { assertEquals } from "jsr:@std/assert";
import {
  buildSubscriptionEventPayload,
  formatAmountEsMX,
  formatDateEsMX,
  subscriptionEventForBillingReason,
} from "./subscription-events.ts";

Deno.test("subscriptionEventForBillingReason: subscription_create es activación", () => {
  assertEquals(subscriptionEventForBillingReason("subscription_create"), "subscription.activated");
});

Deno.test("subscriptionEventForBillingReason: subscription_cycle es renovación", () => {
  assertEquals(subscriptionEventForBillingReason("subscription_cycle"), "subscription.renewed");
});

Deno.test("subscriptionEventForBillingReason: subscription_update (cambio de plan) no dispara nada", () => {
  assertEquals(subscriptionEventForBillingReason("subscription_update"), null);
});

Deno.test("subscriptionEventForBillingReason: null/undefined no dispara nada", () => {
  assertEquals(subscriptionEventForBillingReason(null), null);
  assertEquals(subscriptionEventForBillingReason(undefined), null);
});

// Solo se prueba MXN: es la única moneda que produce Stripe en este negocio
// (precios en precio_mxn, invoice.currency siempre "mxn"). Intl con locale
// es-MX antepone el símbolo "$" para MXN, pero para otras monedas antepone
// el código ISO (p. ej. "USD 1,000.00") — formatAmountEsMX no está pensado
// para esos casos y no se prueban aquí.
Deno.test("formatAmountEsMX: 49900 centavos MXN es $499.00 MXN", () => {
  assertEquals(formatAmountEsMX(49900, "mxn"), "$499.00 MXN");
});

Deno.test("formatDateEsMX: formatea en español, día-mes-año", () => {
  assertEquals(formatDateEsMX(new Date(Date.UTC(2026, 7, 18))), "18 de agosto de 2026");
});

Deno.test("buildSubscriptionEventPayload: arma el payload completo con las claves esperadas", () => {
  const payload = buildSubscriptionEventPayload({
    amountCents: 49900,
    currency: "mxn",
    planName: "Básico",
    cfdiLimit: 200,
    periodStart: new Date(Date.UTC(2026, 7, 18)),
    periodEnd: new Date(Date.UTC(2026, 8, 18)),
    receiptUrl: "https://factio.lovable.app/profile/receipts/abc-123",
  });

  assertEquals(payload, {
    amount: "$499.00 MXN",
    cfdi_limit: "200 CFDIs",
    next_billing_date: "18 de septiembre de 2026",
    plan_name: "Básico",
    receipt_url: "https://factio.lovable.app/profile/receipts/abc-123",
    renewal_date: "18 de agosto de 2026",
  });
});
