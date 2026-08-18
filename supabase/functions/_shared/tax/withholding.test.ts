// Corre con `deno test supabase/functions/_shared` (ver deno.json en
// supabase/functions/). Runtime distinto de Vitest a propósito — este
// módulo vive en las Edge Functions (Deno), no en el frontend (Node/Vite).

import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { determineClientType, resolveTaxTreatment } from "./withholding.ts";

// Cliente de Supabase mockeado: un objeto simple que implementa
// .from().select().eq()...maybeSingle() (o .limit() como terminal, para la
// rama de plataforma tecnológica) devolviendo datos fijos de prueba — nunca
// un cliente real ni conexión a la base de datos, tal como pide el cambio.
function mockSupabaseClient(
  result: { data: unknown; error: { message: string } | null },
  terminal: "maybeSingle" | "limit" = "maybeSingle",
) {
  const fromCalls: string[] = [];
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "eq", "lte", "or"]) {
    chain[method] = () => chain;
  }
  chain.from = (table: unknown) => {
    fromCalls.push(String(table));
    return chain;
  };
  if (terminal === "maybeSingle") {
    chain.maybeSingle = () => Promise.resolve(result);
    chain.limit = () => chain;
  } else {
    chain.limit = () => Promise.resolve(result);
    chain.maybeSingle = () => chain;
  }
  return { client: chain as unknown as SupabaseClient, fromCalls };
}

Deno.test("determineClientType: RFC de 12 caracteres es persona_moral", () => {
  assertEquals(determineClientType("ABC850101XY1", false), "persona_moral");
});

Deno.test("determineClientType: RFC de 13 caracteres es persona_fisica", () => {
  assertEquals(determineClientType("PEPJ800101ABC", false), "persona_fisica");
});

Deno.test("determineClientType: isTechnologyPlatform siempre gana, sin importar el largo del RFC", () => {
  assertEquals(
    determineClientType("ABC850101XY1", true),
    "plataforma_tecnologica",
  );
  assertEquals(
    determineClientType("PEPJ800101ABC", true),
    "plataforma_tecnologica",
  );
});

Deno.test("resolveTaxTreatment: persona_fisica siempre da tasas en 0 sin consultar la base", async () => {
  const { client, fromCalls } = mockSupabaseClient({ data: null, error: null });
  const result = await resolveTaxTreatment(client, {
    taxRegime: "601",
    activityCategory: "servicios_profesionales",
    rfc: "PEPJ800101ABC",
    isTechnologyPlatform: false,
  });
  assertEquals(result, {
    clientType: "persona_fisica",
    isrRetencionPct: 0,
    ivaRetencionPct: 0,
    warning: null,
  });
  // Blindaje contra un futuro cambio accidental que dispare una consulta
  // innecesaria para un caso que nunca requiere retención.
  assertEquals(fromCalls.length, 0);
});

Deno.test("resolveTaxTreatment: plataforma_tecnologica sin brackets activos da warning y tasas en 0", async () => {
  const { client } = mockSupabaseClient({ data: [], error: null }, "limit");
  const result = await resolveTaxTreatment(client, {
    taxRegime: null,
    activityCategory: null,
    rfc: "ABC850101XY1",
    isTechnologyPlatform: true,
  });
  assertEquals(result.clientType, "plataforma_tecnologica");
  assertEquals(result.isrRetencionPct, 0);
  assertEquals(result.ivaRetencionPct, 0);
  assert(result.warning !== null);
  assert(result.warning!.includes("platform_isr_brackets"));
});

Deno.test("resolveTaxTreatment: plataforma_tecnologica con brackets encontrados también da tasas en 0 (selección aún no implementada)", async () => {
  const { client } = mockSupabaseClient({
    data: [{ id: "bracket-1" }],
    error: null,
  }, "limit");
  const result = await resolveTaxTreatment(client, {
    taxRegime: null,
    activityCategory: null,
    rfc: "ABC850101XY1",
    isTechnologyPlatform: true,
  });
  assertEquals(result.isrRetencionPct, 0);
  assertEquals(result.ivaRetencionPct, 0);
  assert(result.warning !== null);
  assert(result.warning!.includes("no está implementada"));
});

Deno.test("resolveTaxTreatment: persona_moral con regla activa encontrada devuelve las tasas tal cual", async () => {
  const { client } = mockSupabaseClient({
    data: { isr_retencion_pct: 10, iva_retencion_pct: 10.6667 },
    error: null,
  });
  const result = await resolveTaxTreatment(client, {
    taxRegime: "601",
    activityCategory: "servicios_profesionales",
    rfc: "ABC850101XY1",
    isTechnologyPlatform: false,
  });
  assertEquals(result, {
    clientType: "persona_moral",
    isrRetencionPct: 10,
    ivaRetencionPct: 10.6667,
    warning: null,
  });
});

Deno.test("resolveTaxTreatment: persona_moral sin regla encontrada (data null) da tasas en 0 y warning descriptivo", async () => {
  const { client } = mockSupabaseClient({ data: null, error: null });
  const result = await resolveTaxTreatment(client, {
    taxRegime: "601",
    activityCategory: "servicios_profesionales",
    rfc: "ABC850101XY1",
    isTechnologyPlatform: false,
  });
  assertEquals(result.isrRetencionPct, 0);
  assertEquals(result.ivaRetencionPct, 0);
  assert(result.warning !== null);
  assert(result.warning!.includes("601"));
  assert(result.warning!.includes("persona_moral"));
  assert(result.warning!.includes("servicios_profesionales"));
});

Deno.test("resolveTaxTreatment: error del cliente Supabase no lanza excepción, se refleja en warning", async () => {
  const { client } = mockSupabaseClient({
    data: null,
    error: { message: "conexión rechazada" },
  });
  const result = await resolveTaxTreatment(client, {
    taxRegime: "601",
    activityCategory: "servicios_profesionales",
    rfc: "ABC850101XY1",
    isTechnologyPlatform: false,
  });
  assertEquals(result.isrRetencionPct, 0);
  assertEquals(result.ivaRetencionPct, 0);
  assertStrictEquals(result.warning?.includes("conexión rechazada"), true);
});

Deno.test("resolveTaxTreatment: persona_moral sin taxRegime da warning sin consultar la base", async () => {
  const { client, fromCalls } = mockSupabaseClient({ data: null, error: null });
  const result = await resolveTaxTreatment(client, {
    taxRegime: null,
    activityCategory: "servicios_profesionales",
    rfc: "ABC850101XY1",
    isTechnologyPlatform: false,
  });
  assertEquals(result.isrRetencionPct, 0);
  assertEquals(result.ivaRetencionPct, 0);
  assert(result.warning !== null);
  assertEquals(fromCalls.length, 0);
});
