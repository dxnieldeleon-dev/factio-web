// Corre con `deno test supabase/functions/_shared` (ver deno.json en
// supabase/functions/). No se hace ninguna llamada de red real: se
// reemplaza globalThis.fetch por un mock y se restaura al final de cada
// prueba.

import { assertEquals, assertRejects } from "jsr:@std/assert";
import { isResendError } from "./errors.ts";
import { triggerEvent } from "./events.ts";

function withMockFetch<T>(
  mock: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  run: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = mock as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

Deno.test("triggerEvent: hace POST a /events con la URL, headers y body correctos", async () => {
  Deno.env.set("RESEND_API_KEY", "re_test_key");
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;

  await withMockFetch(
    (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return Promise.resolve(new Response(null, { status: 200 }));
    },
    () =>
      triggerEvent({
        event: "subscription.activated",
        email: "cliente@example.com",
        payload: { plan_name: "Básico" },
      }),
  );

  assertEquals(capturedUrl, "https://api.resend.com/events");
  assertEquals(capturedInit?.method, "POST");
  assertEquals(
    (capturedInit?.headers as Record<string, string>)["Authorization"],
    "Bearer re_test_key",
  );
  assertEquals(
    (capturedInit?.headers as Record<string, string>)["Content-Type"],
    "application/json",
  );
  assertEquals(
    capturedInit?.body,
    JSON.stringify({
      event: "subscription.activated",
      email: "cliente@example.com",
      payload: { plan_name: "Básico" },
    }),
  );

  Deno.env.delete("RESEND_API_KEY");
});

Deno.test("triggerEvent: una respuesta no-2xx lanza ResendError con el status de Resend", async () => {
  Deno.env.set("RESEND_API_KEY", "re_test_key");

  await assertRejects(
    () =>
      withMockFetch(
        () =>
          Promise.resolve(
            new Response(JSON.stringify({ message: "correo inválido" }), { status: 422 }),
          ),
        () =>
          triggerEvent({
            event: "subscription.renewed",
            email: "invalido",
            payload: {},
          }),
      ),
    (err: unknown) => {
      if (!isResendError(err)) throw new Error("se esperaba un ResendError");
      assertEquals(err.status, 422);
      assertEquals(err.message, "correo inválido");
    },
  );

  Deno.env.delete("RESEND_API_KEY");
});

Deno.test("triggerEvent: sin RESEND_API_KEY configurado, lanza ResendError sin llamar a fetch", async () => {
  Deno.env.delete("RESEND_API_KEY");
  let fetchCalled = false;

  await assertRejects(
    () =>
      withMockFetch(
        () => {
          fetchCalled = true;
          return Promise.resolve(new Response(null, { status: 200 }));
        },
        () => triggerEvent({ event: "subscription.activated", email: "a@b.com", payload: {} }),
      ),
    (err: unknown) => {
      if (!isResendError(err)) throw new Error("se esperaba un ResendError");
      assertEquals(err.status, 500);
    },
  );
  assertEquals(fetchCalled, false);
});
