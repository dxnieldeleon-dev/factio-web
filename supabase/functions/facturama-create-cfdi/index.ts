// Edge Function: facturama-create-cfdi
// Orquesta el timbrado de una factura registrada en Factio.
// El cliente solo envía invoice_id; los datos fiscales se obtienen en servidor.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createCfdi,
  documentBase64,
  downloadCfdi,
  getCfdi,
  getCfdiId,
  getCfdiUuid,
} from "../_shared/facturama/client.ts";
import {
  CfdiWorkflowError,
  isCfdiWorkflowError,
  isFacturamaError,
  userFacingPacMessage,
} from "../_shared/facturama/errors.ts";
import { resolveTaxTreatment } from "../_shared/tax/withholding.ts";
import { notify } from "../_shared/notify.ts";
import { resolveClientEmail, sendInvoiceEmailAndRecord } from "../_shared/invoice-email.ts";

const allowedOrigin = Deno.env.get("APP_URL") ?? "https://factio.lovable.app";
const cors = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// RFC genérico nacional (venta a público en general) — mirrors
// RFC_GENERIC_NATIONAL in src/lib/fiscal.ts. Duplicated instead of shared
// because Edge Functions only import from ../_shared, never from src/.
const GENERIC_NATIONAL_RFC = "XAXX010101000";
// c_Periodicidad del SAT admitidas por Factio. "05" (Bimestral) queda fuera
// a propósito: es exclusiva de contribuyentes bajo un régimen de
// tributación bimestral (antes RIF), un caso que Factio no modela hoy.
const GLOBAL_PERIODICITIES = new Set(["01", "02", "03", "04"]);
const GLOBAL_MONTHS_PATTERN = /^(0[1-9]|1[0-2])$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "content-type": "application/json",
    },
  });
}

type SupabaseCredentials = {
  url: string;
  anonKey: string;
};

type AuthenticatedUser = {
  id: string;
  accessToken: string;
};

type InvoiceContext = {
  invoice: Record<string, unknown>;
  company: Record<string, unknown>;
  client: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
};

type FacturamaCfdiPayload = {
  Currency: string;
  CurrencyExchangeRate?: number;
  ExpeditionPlace: string;
  Exportation: string;
  Folio: string;
  Serie: string;
  CfdiType: "I";
  PaymentForm: string;
  PaymentMethod: "PUE" | "PPD";
  Issuer: {
    Rfc: string;
    Name: string;
    FiscalRegime: string;
  };
  Receiver: {
    Rfc: string;
    Name: string;
    CfdiUse: string;
    FiscalRegime: string;
    TaxZipCode: string;
  };
  GlobalInformation?: {
    Periodicity: string;
    Months: string;
    Year: number;
  };
  Items: Array<{
    ProductCode: string;
    Description: string;
    UnitCode: string;
    UnitPrice: number;
    Quantity: number;
    Subtotal: number;
    Discount: number;
    TaxObject: "01" | "02";
    Taxes: Array<{
      Name: "IVA" | "ISR";
      Base: number;
      Rate: number;
      IsRetention: boolean;
      IsQuota: false;
      Total: number;
    }>;
    Total: number;
  }>;
};

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Tax rates (e.g. 10.6667% -> 0.106667) need more precision than currency
// amounts — rounding a rate to 2 decimals would turn 1.25% into 1%.
function toRate(value: number): number {
  return Math.round((value + Number.EPSILON) * 1e6) / 1e6;
}

function valuesMatch(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.01;
}

function invoiceMetadata(notes: unknown) {
  const entries = (asText(notes) ?? "").split(";");
  const values = new Map(
    entries.map((entry) => entry.split("=", 2)).filter(([key, value]) => Boolean(key && value)),
  );

  return {
    cfdiType: values.get("cfdi_type") ?? "I",
    exportation: values.get("export") ?? "01",
  };
}

async function buildCfdiPayload(
  context: InvoiceContext,
  user: AuthenticatedUser,
): Promise<FacturamaCfdiPayload | Response> {
  const issuerRfc = asText(context.company.rfc)?.toUpperCase();
  const issuerName = asText(context.company.legal_name);
  const issuerRegime = asText(context.company.tax_regime);
  const expeditionPlace = asText(context.company.postal_code);
  const receiverRfc = asText(context.client.rfc)?.toUpperCase();
  const receiverName = asText(context.client.legal_name);
  const snapshot = context.invoice.client_snapshot;
  const receiverSnapshot =
    snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? (snapshot as Record<string, unknown>)
      : null;
  const receiverFiscalName = asText(receiverSnapshot?.legal_name) ?? receiverName;
  const receiverRegime = asText(receiverSnapshot?.tax_regime) ?? asText(context.client.tax_regime);
  const receiverPostalCode =
    asText(receiverSnapshot?.postal_code) ?? asText(context.client.postal_code);
  const cfdiUse =
    asText(context.invoice.cfdi_use) ??
    asText(receiverSnapshot?.cfdi_use) ??
    asText(context.client.cfdi_use);

  if (
    !issuerRfc ||
    !issuerName ||
    !issuerRegime ||
    !expeditionPlace ||
    !receiverRfc ||
    !receiverFiscalName ||
    !receiverRegime ||
    !receiverPostalCode ||
    !cfdiUse
  ) {
    return json({ ok: false, reason: "Faltan datos fiscales obligatorios para el CFDI." }, 400);
  }
  if (!/^\d{5}$/.test(expeditionPlace) || !/^\d{5}$/.test(receiverPostalCode)) {
    return json({ ok: false, reason: "El código postal fiscal debe tener 5 dígitos." }, 400);
  }

  const { cfdiType, exportation } = invoiceMetadata(context.invoice.notes);
  if (cfdiType !== "I") {
    return json({ ok: false, reason: "Por ahora solo se pueden timbrar CFDI de ingreso." }, 400);
  }
  if (!/^0[1-4]$/.test(exportation)) {
    return json({ ok: false, reason: "La clave de exportación no es válida." }, 400);
  }

  const paymentMethod = asText(context.invoice.payment_method);
  const paymentForm = asText(context.invoice.payment_form);
  const currency = asText(context.invoice.currency);
  const series = asText(context.invoice.series);
  const folio = asNumber(context.invoice.folio);
  const exchangeRate = asNumber(context.invoice.exchange_rate);
  if (
    (paymentMethod !== "PUE" && paymentMethod !== "PPD") ||
    !paymentForm ||
    !currency ||
    !series ||
    // folio es 0 en todo borrador sin timbrar (placeholder; finalize_cfdi_stamp
    // lo asigna atómicamente recién al confirmarse el timbrado — ver
    // 20260804230000_folio_only_on_issue.sql), así que 0 es válido aquí y
    // solo se rechaza si el valor ni siquiera es numérico.
    folio === null ||
    !exchangeRate ||
    exchangeRate <= 0
  ) {
    return json({ ok: false, reason: "La factura contiene datos de pago incompletos." }, 400);
  }
  if (paymentMethod === "PPD" && paymentForm !== "99") {
    return json({ ok: false, reason: "Un CFDI PPD debe usar la forma de pago 99." }, 400);
  }

  // The automatic retention rate depends on the issuer's regime, the
  // receiver's client_type, and the issuer's activity category — never on
  // individual item content — so it's resolved once per invoice, not per
  // item. A product can still override it per line (see productOverride
  // below), but the automatic rate itself is always server-side: it's a
  // business rule derived from regime/client/activity, not something a
  // client request should be trusted to supply (unlike iva_rate, which is
  // a plain per-item choice).
  const activityProfile = context.company.activity_profiles as
    | { activity_category?: string }
    | null
    | undefined;
  const credentials = getSupabaseCredentials();
  if (credentials instanceof Response) return credentials;
  const taxSupabase = createUserScopedClient(credentials, user.accessToken);
  const taxTreatment = await resolveTaxTreatment(taxSupabase, {
    taxRegime: issuerRegime,
    activityCategory: activityProfile?.activity_category ?? null,
    rfc: receiverRfc,
    isTechnologyPlatform: context.client.is_technology_platform === true,
  });
  if (taxTreatment.warning) {
    console.warn("Tax withholding could not be fully resolved", {
      invoiceId: context.invoice.id,
      warning: taxTreatment.warning,
    });
  }

  // Persona física nunca lleva retención, sin excepción — ni el motor
  // automático ni un producto con tasa fija pueden anular esta regla.
  const isPersonaFisica = taxTreatment.clientType === "persona_fisica";

  let subtotal = 0;
  let ivaTotal = 0;
  let isrRetencionTotal = 0;
  let ivaRetencionTotal = 0;
  const items: FacturamaCfdiPayload["Items"] = [];
  for (const item of context.items) {
    const productCode = asText(item.sat_key);
    const unitCode = asText(item.sat_unit);
    const description = asText(item.description);
    const quantity = asNumber(item.quantity);
    const unitPrice = asNumber(item.unit_price);
    const discount = asNumber(item.discount) ?? 0;
    const ivaRate = asNumber(item.iva_rate);
    if (
      !productCode ||
      !unitCode ||
      !description ||
      quantity === null ||
      unitPrice === null ||
      ivaRate === null ||
      quantity <= 0 ||
      unitPrice < 0 ||
      discount < 0 ||
      ivaRate < 0
    ) {
      return json({ ok: false, reason: "Uno o más conceptos son inválidos." }, 400);
    }

    // El SAT distingue si un concepto es "objeto de impuesto" (c_ObjetoImp).
    // Fuente de verdad: tax_object en la BD, nunca iva_rate por sí solo — un
    // concepto marcado "01" (no objeto) no lleva traslado de IVA aunque el
    // cliente mande una tasa distinta de cero.
    const taxObject: "01" | "02" = asText(item.tax_object) === "01" ? "01" : "02";

    const lineSubtotal = toMoney(quantity * unitPrice - discount);
    if (lineSubtotal < 0) {
      return json({ ok: false, reason: "El descuento no puede exceder el importe." }, 400);
    }
    const lineIva = taxObject === "01" ? 0 : toMoney(lineSubtotal * ivaRate);

    // Un producto puede fijar su propia tasa de retención (override del
    // motor automático de la factura) — pero solo aplica a persona moral;
    // nunca se retiene a persona física, sin importar lo que diga el
    // producto. Sin override, se usa la tasa automática de siempre.
    const productOverride = item.products as {
      isr_retencion_rate: number | null;
      iva_retencion_rate: number | null;
    } | null;
    const isrFraction = isPersonaFisica
      ? 0
      : (productOverride?.isr_retencion_rate ?? taxTreatment.isrRetencionPct / 100);
    // Sin traslado de IVA no hay nada que retener por ese concepto de IVA.
    const ivaRetFraction =
      isPersonaFisica || taxObject === "01"
        ? 0
        : (productOverride?.iva_retencion_rate ?? taxTreatment.ivaRetencionPct / 100);
    const lineIsrRetencion = toMoney(lineSubtotal * isrFraction);
    const lineIvaRetencion = toMoney(lineSubtotal * ivaRetFraction);
    subtotal = toMoney(subtotal + lineSubtotal);
    ivaTotal = toMoney(ivaTotal + lineIva);
    isrRetencionTotal = toMoney(isrRetencionTotal + lineIsrRetencion);
    ivaRetencionTotal = toMoney(ivaRetencionTotal + lineIvaRetencion);

    const taxes: FacturamaCfdiPayload["Items"][number]["Taxes"] =
      taxObject === "02"
        ? [
            {
              Name: "IVA",
              Base: lineSubtotal,
              Rate: ivaRate,
              IsRetention: false,
              IsQuota: false,
              Total: lineIva,
            },
          ]
        : [];
    if (lineIsrRetencion > 0) {
      taxes.push({
        Name: "ISR",
        Base: lineSubtotal,
        Rate: toRate(isrFraction),
        IsRetention: true,
        IsQuota: false,
        Total: lineIsrRetencion,
      });
    }
    if (lineIvaRetencion > 0) {
      taxes.push({
        Name: "IVA",
        Base: lineSubtotal,
        Rate: toRate(ivaRetFraction),
        IsRetention: true,
        IsQuota: false,
        Total: lineIvaRetencion,
      });
    }

    items.push({
      ProductCode: productCode,
      Description: description,
      UnitCode: unitCode,
      UnitPrice: unitPrice,
      Quantity: quantity,
      Subtotal: lineSubtotal,
      Discount: discount,
      TaxObject: taxObject,
      Taxes: taxes,
      // Facturama's api-lite validates each item's Total as the net payable
      // amount for that line: Subtotal + traslados - retenciones. Omitting
      // the retention subtraction (as this used to) only surfaces once a
      // line actually carries a nonzero retention — Facturama rejects the
      // create call with "El cálculo del total es incorrecto."
      Total: toMoney(lineSubtotal + lineIva - lineIsrRetencion - lineIvaRetencion),
    });
  }

  const storedSubtotal = asNumber(context.invoice.subtotal);
  const storedIva = asNumber(context.invoice.iva_total);
  const storedIsrRetencion = asNumber(context.invoice.isr_retencion_total);
  const storedIvaRetencion = asNumber(context.invoice.iva_retencion_total);
  const storedRetentionsTotal = asNumber(context.invoice.retentions_total);
  const storedTotal = asNumber(context.invoice.total);
  const retentionsTotal = toMoney(isrRetencionTotal + ivaRetencionTotal);
  const total = toMoney(subtotal + ivaTotal - retentionsTotal);
  if (
    storedSubtotal === null ||
    storedIva === null ||
    storedIsrRetencion === null ||
    storedIvaRetencion === null ||
    storedRetentionsTotal === null ||
    storedTotal === null ||
    !valuesMatch(storedSubtotal, subtotal) ||
    !valuesMatch(storedIva, ivaTotal) ||
    !valuesMatch(storedIsrRetencion, isrRetencionTotal) ||
    !valuesMatch(storedIvaRetencion, ivaRetencionTotal) ||
    !valuesMatch(storedRetentionsTotal, retentionsTotal) ||
    !valuesMatch(storedTotal, total)
  ) {
    return json(
      { ok: false, reason: "Los totales guardados no coinciden con los conceptos." },
      409,
    );
  }

  // Factura Global (venta a público en general): agrega el nodo
  // GlobalInformation solo cuando la factura fue creada como tal — el resto
  // del payload es idéntico a una factura normal. Se revalida todo aquí
  // (nunca se confía en lo que ya validó el CHECK de la BD o el cliente):
  // el receptor debe ser exactamente el RFC genérico nacional con régimen
  // 616 y uso S01, y los tres campos de periodicidad deben venir completos
  // y dentro del catálogo soportado.
  let globalInformation: FacturamaCfdiPayload["GlobalInformation"];
  if (context.invoice.is_global === true) {
    if (receiverRfc !== GENERIC_NATIONAL_RFC || cfdiUse !== "S01" || receiverRegime !== "616") {
      return json(
        {
          ok: false,
          reason:
            "Una factura global debe emitirse al RFC genérico XAXX010101000, régimen 616 y uso S01.",
        },
        400,
      );
    }

    const globalPeriodicity = asText(context.invoice.global_periodicity);
    const globalMonths = asText(context.invoice.global_months);
    const globalYear = asNumber(context.invoice.global_year);
    if (
      !globalPeriodicity ||
      !GLOBAL_PERIODICITIES.has(globalPeriodicity) ||
      !globalMonths ||
      !GLOBAL_MONTHS_PATTERN.test(globalMonths) ||
      globalYear === null ||
      globalYear < 2000 ||
      globalYear > 2100
    ) {
      return json(
        { ok: false, reason: "Los datos de periodicidad de la factura global no son válidos." },
        400,
      );
    }

    globalInformation = { Periodicity: globalPeriodicity, Months: globalMonths, Year: globalYear };
  }

  return {
    Currency: currency,
    ...(currency === "MXN" ? {} : { CurrencyExchangeRate: exchangeRate }),
    ExpeditionPlace: expeditionPlace,
    Exportation: exportation,
    Folio: String(folio),
    Serie: series,
    CfdiType: "I",
    PaymentForm: paymentForm,
    PaymentMethod: paymentMethod,
    Issuer: { Rfc: issuerRfc, Name: issuerName, FiscalRegime: issuerRegime },
    Receiver: {
      Rfc: receiverRfc,
      Name: receiverFiscalName,
      CfdiUse: cfdiUse,
      FiscalRegime: receiverRegime,
      TaxZipCode: receiverPostalCode,
    },
    ...(globalInformation ? { GlobalInformation: globalInformation } : {}),
    Items: items,
  };
}

function getSupabaseCredentials(): SupabaseCredentials | Response {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!url || !anonKey) {
    console.error("Supabase authentication environment is not configured");
    return json({ ok: false, reason: "Configuración de autenticación incompleta." }, 500);
  }

  return { url, anonKey };
}

function createUserScopedClient(credentials: SupabaseCredentials, accessToken: string) {
  return createClient(credentials.url, credentials.anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s/g, ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function cfdiDocumentPath(userId: string, invoiceId: string, extension: "xml" | "pdf") {
  return `${userId}/${invoiceId}.${extension}`;
}

async function storeCfdiDocument(
  user: AuthenticatedUser,
  invoiceId: string,
  extension: "xml" | "pdf",
  contentBase64: string,
): Promise<string | Response> {
  const credentials = getSupabaseCredentials();
  if (credentials instanceof Response) return credentials;

  const path = cfdiDocumentPath(user.id, invoiceId, extension);
  const supabase = createUserScopedClient(credentials, user.accessToken);
  const { error } = await supabase.storage
    .from("cfdi-documents")
    .upload(path, base64ToBytes(contentBase64), {
      contentType: extension === "xml" ? "application/xml" : "application/pdf",
      upsert: true,
    });

  if (error) {
    console.error("Unable to store CFDI document", { invoiceId, extension, error: error.message });
    return json(
      {
        ok: false,
        reason: `No fue posible guardar el archivo ${extension.toUpperCase()} del CFDI.`,
      },
      502,
    );
  }
  return path;
}

async function removeStoredCfdiDocuments(user: AuthenticatedUser, invoiceId: string) {
  const credentials = getSupabaseCredentials();
  if (credentials instanceof Response) return;
  const supabase = createUserScopedClient(credentials, user.accessToken);
  await supabase.storage
    .from("cfdi-documents")
    .remove([
      cfdiDocumentPath(user.id, invoiceId, "xml"),
      cfdiDocumentPath(user.id, invoiceId, "pdf"),
    ]);
}

async function markStampForReconciliation(
  user: AuthenticatedUser,
  invoiceId: string,
  error: unknown,
  cfdiId: string | null = null,
) {
  const credentials = getSupabaseCredentials();
  if (credentials instanceof Response) return;
  const supabase = createUserScopedClient(credentials, user.accessToken);
  const message =
    error instanceof Error ? error.message : "No fue posible confirmar el resultado del timbrado.";
  // Cuando ya tenemos el identificador del CFDI en Facturama (la solicitud de
  // timbrado sí llegó a buen puerto y falló un paso posterior), lo guardamos
  // para que la reconciliación pueda recuperar el CFDI sin volver a adivinar.
  const pacResponse =
    cfdiId || isFacturamaError(error) || isCfdiWorkflowError(error)
      ? {
          facturama_cfdi_id: cfdiId,
          raw_error_response:
            isFacturamaError(error) || isCfdiWorkflowError(error) ? error.pacResponse : null,
        }
      : null;
  const { error: updateError } = await supabase.rpc("mark_cfdi_stamp_reconciliation_required", {
    p_invoice_id: invoiceId,
    p_error: message,
    p_pac_response: pacResponse,
  });
  if (updateError) {
    console.error("Unable to mark CFDI for reconciliation", {
      invoiceId,
      error: updateError.message,
    });
  }
}

async function releaseStampClaim(user: AuthenticatedUser, invoiceId: string, error: Error) {
  const credentials = getSupabaseCredentials();
  if (credentials instanceof Response) return;
  const supabase = createUserScopedClient(credentials, user.accessToken);
  const { error: updateError } = await supabase.rpc("release_cfdi_stamp_claim", {
    p_invoice_id: invoiceId,
    p_error: error.message,
  });
  if (updateError) {
    console.error("Unable to release CFDI stamp claim", { invoiceId, error: updateError.message });
  }
}

function integrationErrorResponse(error: unknown): Response {
  if (isFacturamaError(error)) {
    console.error("Facturama CFDI request failed", {
      status: error.status,
      pacResponse: error.pacResponse,
      message: error.message,
    });
    return json(
      {
        ok: false,
        stamped: false,
        reason: userFacingPacMessage(
          error,
          "Ocurrió un problema técnico al timbrar tu comprobante. Intenta de nuevo en unos minutos.",
        ),
        facturama_status: error.status,
        facturama_response: error.pacResponse,
      },
      error.status >= 500 ? 502 : error.status,
    );
  }

  if (isCfdiWorkflowError(error)) {
    console.error("CFDI workflow failed", {
      status: error.status,
      pacResponse: error.pacResponse,
      message: error.message,
    });
    return json(
      {
        ok: false,
        stamped: false,
        reason: error.message,
        facturama_status: null,
        facturama_response: error.pacResponse,
      },
      error.status,
    );
  }

  const message =
    error instanceof Error ? error.message : "Error no identificable al finalizar el timbrado.";
  console.error("CFDI finalization failed", { message });
  return json({ ok: false, stamped: false, reason: message }, 500);
}

async function authenticateRequest(req: Request): Promise<AuthenticatedUser | Response> {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");

  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ ok: false, reason: "No autenticado." }, 401);
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    return json({ ok: false, reason: "Token inválido." }, 401);
  }

  const credentials = getSupabaseCredentials();
  if (credentials instanceof Response) return credentials;

  const supabase = createClient(credentials.url, credentials.anonKey);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return json({ ok: false, reason: "Sesión inválida o expirada." }, 401);
  }

  return { id: user.id, accessToken };
}

async function loadInvoiceContext(
  user: AuthenticatedUser,
  invoiceId: string,
): Promise<InvoiceContext | Response> {
  const credentials = getSupabaseCredentials();
  if (credentials instanceof Response) return credentials;

  // Las consultas conservan el JWT del usuario: RLS y el filtro explícito de
  // user_id son defensas complementarias para impedir acceso entre cuentas.
  const supabase = createUserScopedClient(credentials, user.accessToken);
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      "id, user_id, company_id, client_id, client_snapshot, series, folio, status, payment_method, payment_form, cfdi_use, currency, exchange_rate, subtotal, discount, iva_total, isr_retencion_total, iva_retencion_total, retentions_total, total, notes, is_global, global_periodicity, global_months, global_year",
    )
    .eq("id", invoiceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (invoiceError) {
    console.error("Unable to load invoice", invoiceError.message);
    return json({ ok: false, reason: "No fue posible obtener la factura." }, 500);
  }
  if (!invoice) {
    return json({ ok: false, reason: "Factura no encontrada." }, 404);
  }
  if (!invoice.company_id || !invoice.client_id) {
    return json({ ok: false, reason: "La factura no tiene emisor o receptor configurado." }, 400);
  }

  const [companyResult, clientResult, itemsResult] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, user_id, legal_name, rfc, tax_regime, postal_code, csd_cer_url, csd_key_url, csd_serial_number, csd_valid_to, activity_profile_id, activity_profiles(activity_category)",
      )
      .eq("id", invoice.company_id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("clients")
      .select(
        "id, user_id, legal_name, rfc, tax_regime, postal_code, cfdi_use, is_technology_platform, email",
      )
      .eq("id", invoice.client_id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("invoice_items")
      .select(
        "id, invoice_id, user_id, sat_key, sat_unit, description, quantity, unit_price, discount, iva_rate, iva_amount, tax_object, amount, position, products(isr_retencion_rate, iva_retencion_rate)",
      )
      .eq("invoice_id", invoice.id)
      .eq("user_id", user.id)
      .order("position", { ascending: true }),
  ]);

  if (companyResult.error || clientResult.error || itemsResult.error) {
    console.error("Unable to load invoice dependencies", {
      company: companyResult.error?.message,
      client: clientResult.error?.message,
      items: itemsResult.error?.message,
    });
    return json({ ok: false, reason: "No fue posible obtener los datos fiscales." }, 500);
  }
  if (!companyResult.data || !clientResult.data) {
    return json({ ok: false, reason: "El emisor o receptor ya no está disponible." }, 409);
  }
  if (!itemsResult.data?.length) {
    return json({ ok: false, reason: "La factura no contiene conceptos." }, 400);
  }

  return {
    invoice,
    company: companyResult.data,
    client: clientResult.data,
    items: itemsResult.data,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ ok: false, reason: "Método no permitido." }, 405);
  }

  const user = await authenticateRequest(req);
  if (user instanceof Response) return user;

  let payload: { invoice_id?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, reason: "Cuerpo de la petición inválido." }, 400);
  }

  const invoiceId = payload?.invoice_id;
  if (typeof invoiceId !== "string" || !UUID_PATTERN.test(invoiceId)) {
    return json({ ok: false, reason: "invoice_id debe ser un UUID válido." }, 400);
  }

  const context = await loadInvoiceContext(user, invoiceId);
  if (context instanceof Response) return context;

  const cfdiPayload = await buildCfdiPayload(context, user);
  if (cfdiPayload instanceof Response) return cfdiPayload;

  if (context.invoice.status !== "draft") {
    return json(
      { ok: false, stamped: false, reason: "La factura ya no está disponible para timbrado." },
      409,
    );
  }

  const credentials = getSupabaseCredentials();
  if (credentials instanceof Response) return credentials;
  const supabase = createUserScopedClient(credentials, user.accessToken);
  const { data: claimed, error: claimError } = await supabase.rpc("claim_cfdi_stamp", {
    p_invoice_id: invoiceId,
  });
  if (claimError) {
    console.error("Unable to claim CFDI stamp", { invoiceId, error: claimError.message });
    return json({ ok: false, stamped: false, reason: "No fue posible iniciar el timbrado." }, 500);
  }
  if (!claimed) {
    return json(
      {
        ok: false,
        stamped: false,
        reason:
          "La factura ya está siendo timbrada o requiere conciliación. No la intentes emitir de nuevo.",
      },
      409,
    );
  }

  // Se declara fuera del try para que, sin importar en qué paso falle el
  // resto del flujo, el manejo de errores conozca si Facturama ya generó un
  // CFDI para esta factura y pueda guardarlo para su reconciliación.
  let cfdiId: string | null = null;

  try {
    // Send the validated object as-is; buildCfdiPayload remains the only mapper.
    const stampResponse = await createCfdi(cfdiPayload);
    cfdiId = getCfdiId(stampResponse);
    if (!cfdiId) {
      throw new CfdiWorkflowError(
        "El comprobante se timbró pero no se recibió el identificador del CFDI.",
        502,
        stampResponse,
      );
    }

    const detailResponse = getCfdiUuid(stampResponse) ? stampResponse : await getCfdi(cfdiId);
    const uuid = getCfdiUuid(detailResponse);
    if (!uuid) {
      throw new CfdiWorkflowError(
        "No se recibió el UUID fiscal del comprobante timbrado.",
        502,
        detailResponse,
      );
    }

    const [xmlResponse, pdfResponse] = await Promise.all([
      downloadCfdi(cfdiId, "xml"),
      downloadCfdi(cfdiId, "pdf"),
    ]);
    const [xmlPath, pdfPath] = await Promise.all([
      storeCfdiDocument(user, invoiceId, "xml", documentBase64(xmlResponse)),
      storeCfdiDocument(user, invoiceId, "pdf", documentBase64(pdfResponse)),
    ]);
    if (xmlPath instanceof Response) {
      await markStampForReconciliation(
        user,
        invoiceId,
        new Error("No fue posible guardar el XML del CFDI."),
        cfdiId,
      );
      return xmlPath;
    }
    if (pdfPath instanceof Response) {
      await markStampForReconciliation(
        user,
        invoiceId,
        new Error("No fue posible guardar el PDF del CFDI."),
        cfdiId,
      );
      return pdfPath;
    }
    const pacResponse = {
      create: stampResponse,
      detail: detailResponse === stampResponse ? undefined : detailResponse,
      facturama_cfdi_id: cfdiId,
    };
    const { data: walletResult, error: finalizeError } = await supabase.rpc("finalize_cfdi_stamp", {
      p_invoice_id: invoiceId,
      p_uuid_fiscal: uuid,
      p_xml_url: xmlPath,
      p_pdf_url: pdfPath,
      p_pac_response: pacResponse,
    });
    if (finalizeError) {
      await removeStoredCfdiDocuments(user, invoiceId);
      throw new CfdiWorkflowError(
        `El CFDI fue timbrado, pero no se pudo finalizar su registro: ${finalizeError.message}`,
        409,
        pacResponse,
      );
    }

    // El folio real solo se conoce hasta que finalize_cfdi_stamp lo asigna
    // (nunca antes, ver 20260804230000_folio_only_on_issue.sql), así que se
    // relee aquí para poder mostrarlo en el título de la notificación.
    const { data: stampedInvoice } = await supabase
      .from("invoices")
      .select("series, folio")
      .eq("id", invoiceId)
      .maybeSingle();
    const folioLabel = stampedInvoice
      ? `${stampedInvoice.series}-${String(stampedInvoice.folio).padStart(6, "0")}`
      : null;

    // Copia por correo, best-effort: el CFDI ya está timbrado y es válido
    // ante el SAT en este punto — un fallo aquí (o la ausencia de correo del
    // cliente, un caso esperado) nunca debe afectar la respuesta de éxito
    // del timbrado. sendInvoiceEmailAndRecord nunca lanza, pero se envuelve
    // en try/catch de todos modos como defensa adicional.
    const snapshot =
      context.invoice.client_snapshot && typeof context.invoice.client_snapshot === "object"
        ? (context.invoice.client_snapshot as Record<string, unknown>)
        : null;
    const clientEmail = resolveClientEmail(context.client.email as string | null, snapshot);
    if (clientEmail && folioLabel) {
      try {
        await sendInvoiceEmailAndRecord(supabase, {
          invoiceId,
          folioLabel,
          total: Number(context.invoice.total),
          currency: asText(context.invoice.currency) ?? "MXN",
          companyName: asText(context.company.legal_name) ?? "Factio",
          clientName: asText(snapshot?.legal_name) ?? asText(context.client.legal_name) ?? "",
          clientEmail,
          xmlPath,
          pdfPath,
        });
      } catch (emailError) {
        console.error("Unable to send invoice email", { invoiceId, error: emailError });
      }
    }

    await notify(supabase, {
      user_id: user.id,
      kind: "invoice_stamped",
      title: folioLabel ? `Factura ${folioLabel} timbrada` : "Factura timbrada",
      body: "Tu comprobante fiscal ya está disponible para descargar y compartir.",
      link: `/invoices/${invoiceId}`,
      metadata: { invoice_id: invoiceId, uuid },
    });

    return json({
      ok: true,
      stamped: true,
      stamp_consumed: true,
      invoice_id: invoiceId,
      uuid,
      xml_url: xmlPath,
      pdf_url: pdfPath,
      remaining_stamps: walletResult?.[0]?.balance ?? null,
    });
  } catch (error) {
    if (isFacturamaError(error) && error.status >= 400 && error.status < 500 && !cfdiId) {
      // Facturama rechazó la solicitud desde el inicio (4xx): nunca se generó
      // un CFDI, así que es seguro liberar el timbre reservado para reintentar.
      await releaseStampClaim(user, invoiceId, error);
    } else {
      // Cualquier otro caso es ambiguo (falla de red, 5xx, o un 4xx en un
      // paso posterior a que Facturama ya generara el CFDI): no se libera el
      // timbre ni se reintenta el timbrado automáticamente para evitar
      // duplicar el CFDI ante el SAT. Queda para reconciliación manual/auto.
      await markStampForReconciliation(user, invoiceId, error, cfdiId);
    }

    // Resumen legible del error, nunca el código/mensaje crudo del PAC —
    // userFacingPacMessage ya filtra su nombre y sus mensajes de infra 5xx;
    // los de CfdiWorkflowError ya son texto propio, así que se pasan tal cual.
    const errorSummary = isFacturamaError(error)
      ? userFacingPacMessage(
          error,
          "Ocurrió un problema técnico al timbrar. Intenta de nuevo en unos minutos.",
        )
      : isCfdiWorkflowError(error)
        ? error.message
        : "No se pudo completar el timbrado. Intenta de nuevo o contacta a soporte.";
    const series = asText(context.invoice.series);
    await notify(supabase, {
      user_id: user.id,
      kind: "invoice_stamp_error",
      title: series ? `No se pudo timbrar la factura ${series}` : "No se pudo timbrar la factura",
      body: errorSummary,
      link: `/invoices/${invoiceId}`,
      metadata: { invoice_id: invoiceId },
    });

    return integrationErrorResponse(error);
  }
});
