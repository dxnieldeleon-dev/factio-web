import { ResendError } from "./errors.ts";

interface ResendAttachment {
  filename: string;
  content: string; // base64
}

interface SendEmailParams {
  to: string[];
  subject: string;
  html: string;
  attachments?: ResendAttachment[];
}

interface ResendConfig {
  apiKey: string;
  from: string;
}

function config(): ResendConfig {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  if (!apiKey || !from) {
    throw new ResendError("El envío de correo no está configurado en el servidor.", 500);
  }
  return { apiKey, from };
}

function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "message" in body) {
    const value = (body as Record<string, unknown>).message;
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

export async function sendEmail(params: SendEmailParams): Promise<{ id: string }> {
  const { apiKey, from } = config();

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, ...params }),
    });
  } catch (cause) {
    throw new ResendError(
      "No fue posible establecer comunicación con el servicio de correo.",
      502,
      null,
    );
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body; fall through with body = null.
  }

  if (!response.ok) {
    throw new ResendError(
      messageFromBody(body, `El servicio de correo respondió con HTTP ${response.status}.`),
      response.status,
      body,
    );
  }

  return body as { id: string };
}
