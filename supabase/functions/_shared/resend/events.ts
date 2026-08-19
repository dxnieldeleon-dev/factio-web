// Dispara un evento contra la API de eventos de Resend (distinto de
// _shared/resend/client.ts::sendEmail, que llama /emails) — las plantillas y
// automatizaciones (subscription.activated, subscription.renewed, etc.) ya
// están configuradas del lado de Resend; aquí solo se manda el nombre del
// evento, el correo del destinatario y el payload de variables.

import { ResendError } from "./errors.ts";

export interface TriggerEventParams {
  event: string;
  email: string;
  payload: Record<string, unknown>;
}

function apiKey(): string {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    throw new ResendError("El envío de correo no está configurado en el servidor.", 500);
  }
  return key;
}

function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "message" in body) {
    const value = (body as Record<string, unknown>).message;
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

export async function triggerEvent(params: TriggerEventParams): Promise<void> {
  const key = apiKey();

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });
  } catch (cause) {
    throw new ResendError(
      "No fue posible establecer comunicación con el servicio de correo.",
      502,
      null,
    );
  }

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Non-JSON body; fall through with body = null.
    }
    throw new ResendError(
      messageFromBody(body, `El servicio de correo respondió con HTTP ${response.status}.`),
      response.status,
      body,
    );
  }
}
