// Edge Function: validate-csd
// Valida un CSD (.cer/.key + contraseña), lo registra ante Facturama y guarda
// los archivos cifrados (AES-256-GCM) en Storage — nunca en texto plano.
//
// Uses node-forge (pure JS) instead of node:crypto to parse the certificate
// and decrypt the private key: many real SAT CSDs use legacy PKCS#8
// encryption algorithms (e.g. RC2-40-CBC, 3DES) that Deno's native crypto
// backend does not implement, while forge implements the ciphers itself.

import { decodeBase64, encodeBase64 } from "jsr:@std/encoding/base64";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import forge from "npm:node-forge@1.3.1";
import { uploadCsd, updateCsd } from "../_shared/facturama/client.ts";
import { isFacturamaError, userFacingPacMessage } from "../_shared/facturama/errors.ts";
import { notify } from "../_shared/notify.ts";

const allowedOrigin = Deno.env.get("APP_URL") ?? "https://factio.lovable.app";
const cors = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CsdRequest = {
  company_id?: unknown;
  password?: unknown;
  // Contenido crudo de los archivos, en base64 (sin prefijo data:) — solo se
  // envían cuando el usuario está subiendo/reemplazando el CSD. Si se omiten
  // y la empresa ya tiene un CSD guardado, se re-valida el archivo existente
  // (p. ej. para confirmar la contraseña sin volver a adjuntar los archivos).
  cer_base64?: unknown;
  key_base64?: unknown;
  csd_usage_consent?: unknown;
};

type CsdValidation =
  | { ok: true; serialNumber: string; validFrom: string; validTo: string }
  | { ok: false; field: "cer" | "key" | "password"; error: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

function userClient(url: string, anonKey: string, token: string) {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function uint8ToBinaryString(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return binary;
}

function asBase64(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// --- Cifrado en reposo -------------------------------------------------
// Los .cer/.key nunca se escriben a Storage sin cifrar. La llave vive en
// Supabase Vault (`csd_encryption_key`), expuesta solo a service_role vía la
// RPC get_csd_encryption_key (las Edge Functions no pueden leer el esquema
// `vault` directamente por PostgREST).

let cachedKey: CryptoKey | null = null;

async function getEncryptionKey(): Promise<CryptoKey | null> {
  if (cachedKey) return cachedKey;
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return null;

  const admin = createClient(url, serviceRoleKey);
  const { data, error } = await admin.rpc("get_csd_encryption_key");
  if (error || typeof data !== "string" || !data) {
    console.error("No se pudo obtener la llave de cifrado del CSD", error?.message);
    return null;
  }
  cachedKey = await crypto.subtle.importKey("raw", decodeBase64(data), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  return cachedKey;
}

// IV de 12 bytes al inicio del blob, seguido del ciphertext (que ya incluye
// el tag de autenticación de GCM) — un solo objeto por archivo, sin metadata aparte.
async function encryptBytes(key: CryptoKey, plain: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  return out;
}

// Devuelve null si el blob no se pudo descifrar con esta llave — el llamador
// interpreta eso como "archivo legado sin cifrar" y usa los bytes tal cual,
// en vez de fallar de golpe para CSDs guardados antes de este cambio.
async function tryDecryptBytes(key: CryptoKey, blob: Uint8Array): Promise<Uint8Array | null> {
  if (blob.length < 13) return null;
  const iv = blob.slice(0, 12);
  const cipher = blob.slice(12);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher));
  } catch {
    return null;
  }
}

function validateCsd(
  certificate: Uint8Array,
  privateKey: Uint8Array,
  password: string,
): CsdValidation {
  let cert: forge.pki.Certificate;
  try {
    const certAsn1 = forge.asn1.fromDer(forge.util.createBuffer(uint8ToBinaryString(certificate)));
    cert = forge.pki.certificateFromAsn1(certAsn1);
  } catch {
    return { ok: false, field: "cer", error: "El archivo .cer no es un certificado X.509 válido." };
  }

  const validFrom = cert.validity.notBefore;
  const validTo = cert.validity.notAfter;
  const now = new Date();
  if (now < validFrom || now > validTo) {
    return { ok: false, field: "cer", error: "El CSD no se encuentra vigente." };
  }

  let privateKeyInfo: forge.asn1.Asn1 | null;
  try {
    const keyAsn1 = forge.asn1.fromDer(forge.util.createBuffer(uint8ToBinaryString(privateKey)));
    privateKeyInfo = forge.pki.decryptPrivateKeyInfo(keyAsn1, password);
  } catch {
    privateKeyInfo = null;
  }
  if (!privateKeyInfo) {
    return {
      ok: false,
      field: "password",
      error: "La contraseña de la llave privada es incorrecta, o el archivo .key no es válido.",
    };
  }

  let key: forge.pki.rsa.PrivateKey;
  try {
    key = forge.pki.privateKeyFromAsn1(privateKeyInfo) as forge.pki.rsa.PrivateKey;
  } catch {
    return { ok: false, field: "key", error: "No fue posible leer la llave privada .key." };
  }

  const certPublicKey = cert.publicKey as forge.pki.rsa.PublicKey;
  if (certPublicKey.n.toString(16) !== key.n.toString(16)) {
    return { ok: false, field: "key", error: "La llave privada no corresponde al certificado." };
  }

  return {
    ok: true,
    serialNumber: cert.serialNumber,
    validFrom: validFrom.toISOString(),
    validTo: validTo.toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "Método no permitido." }, 405);

  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return json({ success: false, error: "No autenticado." }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const token = authHeader.slice(7).trim();
  if (!url || !anonKey || !token) {
    return json({ success: false, error: "Configuración de autenticación incompleta." }, 500);
  }

  const auth = createClient(url, anonKey);
  const { data: authData, error: authError } = await auth.auth.getUser(token);
  if (authError || !authData.user) return json({ success: false, error: "Sesión inválida." }, 401);

  let payload: CsdRequest;
  try {
    payload = await req.json();
  } catch {
    return json({ success: false, error: "Cuerpo de la petición inválido." }, 400);
  }
  if (
    typeof payload.company_id !== "string" ||
    !payload.company_id ||
    typeof payload.password !== "string" ||
    !payload.password
  ) {
    return json({ success: false, error: "company_id y password son obligatorios." }, 400);
  }
  if (payload.csd_usage_consent !== true) {
    return json(
      {
        success: false,
        error: "Debes autorizar el uso de tu CSD para el timbrado y cancelación de tus CFDIs.",
      },
      400,
    );
  }

  const supabase = userClient(url, anonKey, token);
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, rfc, csd_cer_url, csd_key_url")
    .eq("id", payload.company_id)
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (companyError || !company)
    return json({ success: false, error: "Empresa no encontrada." }, 404);

  const newCerBase64 = asBase64(payload.cer_base64);
  const newKeyBase64 = asBase64(payload.key_base64);
  const isNewUpload = Boolean(newCerBase64 && newKeyBase64);

  const encryptionKey = await getEncryptionKey();
  if (!encryptionKey) {
    return json(
      { success: false, error: "No fue posible preparar el cifrado del CSD. Intenta de nuevo." },
      500,
    );
  }

  let cerBytes: Uint8Array;
  let keyBytes: Uint8Array;
  // Se re-sube (y así se migra a cifrado) cualquier archivo legado que se
  // haya leído en texto plano, aunque el usuario solo haya venido a
  // re-confirmar su contraseña sin adjuntar archivos nuevos.
  let needsReencryptOfExisting = false;

  if (isNewUpload) {
    try {
      cerBytes = decodeBase64(newCerBase64!);
      keyBytes = decodeBase64(newKeyBase64!);
    } catch {
      return json({ success: false, field: "cer", error: "Los archivos recibidos no son válidos." });
    }
  } else {
    if (!company.csd_cer_url || !company.csd_key_url) {
      return json(
        { success: false, field: "cer", error: "Debes cargar ambos archivos del CSD." },
        400,
      );
    }
    const [cerDownload, keyDownload] = await Promise.all([
      supabase.storage.from("csd-files").download(company.csd_cer_url),
      supabase.storage.from("csd-files").download(company.csd_key_url),
    ]);
    if (cerDownload.error || keyDownload.error || !cerDownload.data || !keyDownload.data) {
      return json(
        { success: false, error: "No fue posible leer los archivos privados del CSD." },
        502,
      );
    }
    const [cerBlobBytes, keyBlobBytes] = await Promise.all([
      cerDownload.data.arrayBuffer().then((value) => new Uint8Array(value)),
      keyDownload.data.arrayBuffer().then((value) => new Uint8Array(value)),
    ]);
    const [cerPlain, keyPlain] = await Promise.all([
      tryDecryptBytes(encryptionKey, cerBlobBytes),
      tryDecryptBytes(encryptionKey, keyBlobBytes),
    ]);
    cerBytes = cerPlain ?? cerBlobBytes;
    keyBytes = keyPlain ?? keyBlobBytes;
    needsReencryptOfExisting = cerPlain === null || keyPlain === null;
  }

  const validation = validateCsd(cerBytes, keyBytes, payload.password);
  if (!validation.ok) {
    await supabase
      .from("companies")
      .update({ csd_status: "error", csd_last_error: validation.error })
      .eq("id", company.id);
    return json({ success: false, field: validation.field, error: validation.error });
  }

  const csdPayload = {
    Rfc: company.rfc.trim().toUpperCase(),
    Certificate: encodeBase64(cerBytes),
    PrivateKey: encodeBase64(keyBytes),
    PrivateKeyPassword: payload.password,
  };
  try {
    await uploadCsd(csdPayload);
  } catch (error) {
    // Facturama's create endpoint 400s if the RFC already has a CSD on file
    // (re-validating after a password typo, renewing an expired CSD, etc.
    // all hit this) — fall back to their update endpoint instead of failing.
    const alreadyExists =
      isFacturamaError(error) && error.message.includes("Ya existe un CSD asociado");
    if (alreadyExists) {
      try {
        await updateCsd(csdPayload);
      } catch (updateError) {
        const message = isFacturamaError(updateError)
          ? userFacingPacMessage(
              updateError,
              "Ocurrió un problema técnico al actualizar tu CSD. Intenta de nuevo en unos minutos.",
            )
          : "No fue posible actualizar tu CSD.";
        await supabase
          .from("companies")
          .update({ csd_status: "error", csd_last_error: message })
          .eq("id", company.id);
        return json({
          success: false,
          error: message,
          facturama_status: isFacturamaError(updateError) ? updateError.status : null,
          facturama_response: isFacturamaError(updateError) ? updateError.pacResponse : null,
        });
      }
    } else {
      const message = isFacturamaError(error)
        ? userFacingPacMessage(
            error,
            "Ocurrió un problema técnico al cargar tu CSD. Intenta de nuevo en unos minutos.",
          )
        : "No fue posible cargar tu CSD.";
      await supabase
        .from("companies")
        .update({ csd_status: "error", csd_last_error: message })
        .eq("id", company.id);
      return json({
        success: false,
        error: message,
        facturama_status: isFacturamaError(error) ? error.status : null,
        facturama_response: isFacturamaError(error) ? error.pacResponse : null,
      });
    }
  }

  const finalCerPath = `${authData.user.id}/${company.id}/cert.cer`;
  const finalKeyPath = `${authData.user.id}/${company.id}/key.key`;
  if (isNewUpload || needsReencryptOfExisting) {
    const [encryptedCer, encryptedKey] = await Promise.all([
      encryptBytes(encryptionKey, cerBytes),
      encryptBytes(encryptionKey, keyBytes),
    ]);
    const [cerUpload, keyUpload] = await Promise.all([
      supabase.storage.from("csd-files").upload(finalCerPath, encryptedCer, {
        upsert: true,
        contentType: "application/octet-stream",
      }),
      supabase.storage.from("csd-files").upload(finalKeyPath, encryptedKey, {
        upsert: true,
        contentType: "application/octet-stream",
      }),
    ]);
    if (cerUpload.error || keyUpload.error) {
      return json(
        {
          success: false,
          error:
            "El CSD fue registrado con el proveedor de timbrado, pero no pudo guardarse en Factio.",
        },
        502,
      );
    }
  }

  const { error: updateError } = await supabase
    .from("companies")
    .update({
      csd_cer_url: finalCerPath,
      csd_key_url: finalKeyPath,
      csd_serial_number: validation.serialNumber,
      csd_valid_from: validation.validFrom,
      csd_valid_to: validation.validTo,
      csd_status: "uploaded",
      csd_uploaded_at: new Date().toISOString(),
      csd_usage_consent_at: new Date().toISOString(),
      csd_last_error: null,
      onboarding_completed: true,
    })
    .eq("id", company.id);
  if (updateError) {
    return json(
      {
        success: false,
        error: "El CSD fue registrado con el proveedor de timbrado, pero no se pudo actualizar la empresa.",
      },
      502,
    );
  }

  // Nunca se incluye la contraseña ni el contenido del .key/.cer aquí — solo
  // metadatos públicos del certificado (número de serie, vigencia).
  await notify(supabase, {
    user_id: authData.user.id,
    kind: "csd_uploaded",
    title: "CSD cargado con éxito",
    body: `Tu certificado de sello digital quedó vigente hasta el ${new Date(validation.validTo).toLocaleDateString("es-MX")}.`,
    link: "/profile/csd",
    metadata: { company_id: company.id, serial_number: validation.serialNumber },
  });

  return json({
    success: true,
    serial_number: validation.serialNumber,
    valid_from: validation.validFrom,
    valid_to: validation.validTo,
    rfc: company.rfc,
  });
});
