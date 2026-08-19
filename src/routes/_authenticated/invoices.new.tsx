import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Search,
  Plus,
  Trash2,
  Check,
  Loader2,
  FileCheck2,
  Download,
  Share2,
  Home,
  AlertCircle,
  Pencil,
  Save,
  Package,
  Folder,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionErrorMessage } from "@/lib/edge-function-errors";
import { formatMXN } from "@/lib/format";
import { openInvoiceDocument, shareInvoiceOnWhatsApp } from "@/lib/invoice-documents";
import { playSuccessChime } from "@/lib/success-chime";
import { TimbradoSuccessOverlay } from "@/components/TimbradoSuccessOverlay";
import {
  CFDI_USES,
  PAYMENT_FORMS,
  PAYMENT_METHODS,
  COMMON_SAT_KEYS,
  COMMON_SAT_UNITS,
  CURRENCIES,
  EXPORT_CODES,
  CFDI_TYPES,
  TAX_REGIMES,
  cfdiUsesForRegime,
  type SatItem,
} from "@/lib/sat-catalogs";
import {
  normalizeFiscalName,
  validateReceiverProfile,
  validatePayment,
  hasErrors,
  RFC_GENERIC_NATIONAL,
  type FieldErrors,
  type ReceiverProfile,
} from "@/lib/fiscal";
import { resolveTaxTreatment } from "@/lib/tax-withholding";
import { loadInvoiceProfile, saveInvoiceProfile } from "@/features/profile/invoice-profile";

export const Route = createFileRoute("/_authenticated/invoices/new")({
  component: NewInvoice,
});

interface ClientRow {
  id: string;
  legal_name: string;
  rfc: string;
  tax_regime: string | null;
  postal_code: string | null;
  cfdi_use: string | null;
  email: string | null;
  phone: string | null;
  is_technology_platform: boolean;
  business_category: string | null;
}
interface ProductRow {
  id: string;
  description: string;
  sat_key: string;
  sat_unit: string;
  unit_price: number;
  iva_rate: number;
  tax_object: string;
  isr_retencion_rate: number | null;
  iva_retencion_rate: number | null;
  category: string | null;
  image_url: string | null;
}
interface LineItem {
  sat_key: string;
  sat_unit: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  iva_rate: number;
  tax_object: "01" | "02";
  // Override manual del producto sobre el motor automático de retenciones
  // (null = usa la retención automática de la factura, calculada por
  // régimen del emisor + tipo de cliente). Nunca se aplica a persona
  // física, sin importar lo que traiga el producto.
  isr_retencion_rate: number | null;
  iva_retencion_rate: number | null;
  product_id?: string;
}

type Step = 1 | 2 | 3 | 4;

// Persists in-progress wizard state across the full-page navigation to
// /clients/new or /products/new, so creating one mid-flow doesn't force
// restarting the invoice from scratch.
const DRAFT_KEY = "factio.invoiceDraft.v1";

// c_Periodicidad del SAT para el nodo GlobalInformation (factura global a
// público en general). "05" (Bimestral) se omite a propósito: esa
// periodicidad es exclusiva de contribuyentes bajo un régimen de
// tributación bimestral (antes RIF), un caso que Factio no modela hoy —
// ver también el CHECK de 20260817000000_factura_global.sql.
const GLOBAL_PERIODICITIES: SatItem[] = [
  { code: "01", name: "Diario" },
  { code: "02", name: "Semanal" },
  { code: "03", name: "Quincenal" },
  { code: "04", name: "Mensual" },
];

// c_Meses del SAT, solo meses individuales (01-12) — los rangos bimestrales
// (13-18) no aplican porque no se ofrece periodicidad Bimestral.
const GLOBAL_MONTHS: SatItem[] = [
  { code: "01", name: "Enero" },
  { code: "02", name: "Febrero" },
  { code: "03", name: "Marzo" },
  { code: "04", name: "Abril" },
  { code: "05", name: "Mayo" },
  { code: "06", name: "Junio" },
  { code: "07", name: "Julio" },
  { code: "08", name: "Agosto" },
  { code: "09", name: "Septiembre" },
  { code: "10", name: "Octubre" },
  { code: "11", name: "Noviembre" },
  { code: "12", name: "Diciembre" },
];

// Mirrors toMoney in supabase/functions/facturama-create-cfdi/index.ts —
// the server recomputes totals per item and rejects a mismatch, so the
// preview has to round the same way to avoid a false 409 on submit.
function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatPct(pct: number | undefined): string {
  return `${(pct ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 4 })}%`;
}

type InvoiceDraft = {
  client: ClientRow;
  receiver: ReceiverProfile;
  saveReceiverEdits: boolean;
  items: LineItem[];
};

function saveInvoiceDraft(draft: InvoiceDraft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // sessionStorage unavailable (e.g. private mode): worst case the
    // wizard restarts, same as before this feature existed.
  }
}

function loadInvoiceDraft(): InvoiceDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as InvoiceDraft) : null;
  } catch {
    return null;
  }
}

function clearInvoiceDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

function NewInvoice() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [client, setClient] = useState<ClientRow | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);

  // Perfil receptor editable para ESTA factura (arranca desde el cliente).
  const [receiver, setReceiver] = useState<ReceiverProfile | null>(null);
  const [saveReceiverEdits, setSaveReceiverEdits] = useState(false);

  // Factura Global (venta a público en general): solo aplica cuando el
  // cliente es el sintético XAXX010101000 elegido desde el Paso 1.
  const [isGlobal, setIsGlobal] = useState(false);
  const [globalPeriodicity, setGlobalPeriodicity] = useState("04");
  const [globalMonths, setGlobalMonths] = useState(
    String(new Date().getMonth() + 1).padStart(2, "0"),
  );
  const [globalYear, setGlobalYear] = useState(new Date().getFullYear());

  // Datos fiscales del comprobante — arrancan con los defaults "de siempre"
  // (Ingreso/PUE/Transferencia/MXN) y se sobreescriben una sola vez si el
  // emisor tiene un perfil de facturación guardado (ver efecto más abajo).
  const [cfdiType, setCfdiType] = useState("I");
  const [paymentMethod, setPaymentMethod] = useState("PUE");
  const [paymentForm, setPaymentForm] = useState("03");
  const [currency, setCurrency] = useState("MXN");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [exportCode, setExportCode] = useState("01");
  const [advancedInvoiceOpen, setAdvancedInvoiceOpen] = useState(false);
  const [saveAsDefaultProfile, setSaveAsDefaultProfile] = useState(false);
  const [invoiceProfileApplied, setInvoiceProfileApplied] = useState(false);

  const [issuing, setIssuing] = useState(false);
  const [result, setResult] = useState<{
    id: string;
    series: string;
    folio: number;
    uuid: string;
    xmlUrl: string;
    pdfUrl: string;
  } | null>(null);
  const [stampSuccessOpen, setStampSuccessOpen] = useState(false);

  // Perfil emisor (para reglas de RFC genérico → CP del emisor)
  const { data: issuer } = useQuery({
    queryKey: ["company", "issuer"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("companies")
        .select("*, activity_profiles(activity_category)")
        .eq("user_id", u.user.id)
        .maybeSingle();
      return data;
    },
  });

  // Defaults de facturación del emisor (Tipo de Comprobante/Moneda/Método/
  // Forma de pago) — ver ADR-004. Si no existe, el formulario se comporta
  // como antes de esta feature (todos los campos visibles con los mismos
  // defaults hardcodeados de arriba).
  const { data: invoiceProfile } = useQuery({
    queryKey: ["invoice-profile", issuer?.id],
    queryFn: () => loadInvoiceProfile(issuer!.id),
    enabled: !!issuer?.id,
  });

  // Se aplica una sola vez (invoiceProfileApplied) para no pisar ediciones
  // que el usuario ya haya hecho en modo avanzado mientras la query resuelve.
  useEffect(() => {
    if (!invoiceProfile || invoiceProfileApplied) return;
    setCfdiType(invoiceProfile.cfdi_type);
    setExportCode(invoiceProfile.export_code);
    setCurrency(invoiceProfile.currency);
    if (invoiceProfile.currency === "MXN") setExchangeRate(1);
    setPaymentMethod(invoiceProfile.payment_method);
    setPaymentForm(invoiceProfile.payment_form);
    setInvoiceProfileApplied(true);
  }, [invoiceProfile, invoiceProfileApplied]);

  // Solo una vista previa: la Edge Function recalcula esto desde cero y es
  // la única fuente de verdad para lo que realmente se timbra.
  const { data: taxTreatment } = useQuery({
    queryKey: [
      "tax-treatment",
      issuer?.tax_regime,
      issuer?.activity_profiles?.activity_category,
      receiver?.rfc,
      client?.is_technology_platform,
    ],
    queryFn: () =>
      resolveTaxTreatment({
        taxRegime: issuer?.tax_regime ?? null,
        activityCategory: issuer?.activity_profiles?.activity_category ?? null,
        rfc: receiver!.rfc,
        isTechnologyPlatform: client?.is_technology_platform ?? false,
      }),
    enabled: !!receiver?.rfc,
  });

  const totals = useMemo(() => {
    const isrPct = taxTreatment?.isrRetencionPct ?? 0;
    const ivaRetPct = taxTreatment?.ivaRetencionPct ?? 0;
    // Persona física nunca lleva retención, sin excepción — ni el motor
    // automático ni un producto con tasa fija pueden anular esta regla.
    const isPersonaFisica = taxTreatment?.clientType === "persona_fisica";
    let subtotal = 0;
    let ivaTotal = 0;
    let isrRetencionTotal = 0;
    let ivaRetencionTotal = 0;
    for (const i of items) {
      const lineSubtotal = toMoney(i.quantity * i.unit_price - i.discount);
      subtotal = toMoney(subtotal + lineSubtotal);
      ivaTotal = toMoney(ivaTotal + toMoney(lineSubtotal * i.iva_rate));
      const isrFraction = isPersonaFisica ? 0 : (i.isr_retencion_rate ?? isrPct / 100);
      const ivaRetFraction =
        isPersonaFisica || i.tax_object === "01" ? 0 : (i.iva_retencion_rate ?? ivaRetPct / 100);
      isrRetencionTotal = toMoney(isrRetencionTotal + toMoney(lineSubtotal * isrFraction));
      ivaRetencionTotal = toMoney(ivaRetencionTotal + toMoney(lineSubtotal * ivaRetFraction));
    }
    const retentionsTotal = toMoney(isrRetencionTotal + ivaRetencionTotal);
    const total = toMoney(subtotal + ivaTotal - retentionsTotal);
    return { subtotal, ivaTotal, isrRetencionTotal, ivaRetencionTotal, retentionsTotal, total };
  }, [items, taxTreatment]);

  const receiverErrors: FieldErrors = useMemo(() => {
    if (!receiver) return {};
    return validateReceiverProfile(receiver, issuer?.postal_code ?? null);
  }, [receiver, issuer]);

  const paymentError = validatePayment(paymentMethod, paymentForm);

  function pickClient(c: ClientRow, global = false) {
    setClient(c);
    setReceiver({
      rfc: c.rfc,
      legal_name: normalizeFiscalName(c.legal_name),
      tax_regime: c.tax_regime,
      postal_code: c.postal_code,
      cfdi_use: c.cfdi_use ?? "G03",
    });
    setSaveReceiverEdits(false);
    setIsGlobal(global);
    setStep(2);
  }

  const [findingPublicoGeneral, setFindingPublicoGeneral] = useState(false);

  // "Venta a público en general": encuentra o crea el cliente sintético de
  // RFC genérico nacional (nunca se agrega vía migración/seed — cada cuenta
  // lo obtiene la primera vez que lo necesita, con RLS por user_id como en
  // cualquier otro cliente).
  async function pickPublicoGeneral() {
    setFindingPublicoGeneral(true);
    try {
      const { data: u, error: userError } = await supabase.auth.getUser();
      if (userError || !u.user)
        throw new Error("Tu sesión no es válida. Inicia sesión nuevamente.");

      const clientSelect =
        "id, legal_name, rfc, tax_regime, postal_code, cfdi_use, email, phone, is_technology_platform, business_category";
      const { data: existing, error: findError } = await supabase
        .from("clients")
        .select(clientSelect)
        .eq("user_id", u.user.id)
        .eq("rfc", RFC_GENERIC_NATIONAL)
        .maybeSingle();
      if (findError) throw findError;

      let row = existing as ClientRow | null;
      if (!row) {
        const { data: created, error: createError } = await supabase
          .from("clients")
          .insert({
            user_id: u.user.id,
            rfc: RFC_GENERIC_NATIONAL,
            legal_name: "PUBLICO EN GENERAL",
            tax_regime: "616",
            postal_code: issuer?.postal_code ?? null,
            cfdi_use: "S01",
          })
          .select(clientSelect)
          .single();
        if (createError) throw createError;
        row = created as ClientRow;
      }

      setGlobalPeriodicity(issuer?.default_global_periodicity ?? "04");
      const now = new Date();
      setGlobalMonths(String(now.getMonth() + 1).padStart(2, "0"));
      setGlobalYear(now.getFullYear());
      pickClient(row, true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No pudimos preparar la venta a público en general",
      );
    } finally {
      setFindingPublicoGeneral(false);
    }
  }

  // Resumes the wizard after creating a client or product mid-flow: those
  // pages do a full navigation away, so this restores whatever was saved
  // to sessionStorage and picks up the newly created row.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeClientId = params.get("resume_client");
    const resumeProductId = params.get("resume_product");
    if (!resumeClientId && !resumeProductId) return;

    (async () => {
      if (resumeClientId) {
        const { data } = await supabase
          .from("clients")
          .select(
            "id, legal_name, rfc, tax_regime, postal_code, cfdi_use, email, phone, is_technology_platform, business_category",
          )
          .eq("id", resumeClientId)
          .maybeSingle();
        if (data) {
          pickClient(data as ClientRow);
          toast.success("Cliente creado y seleccionado");
        }
      } else if (resumeProductId) {
        const draft = loadInvoiceDraft();
        if (draft) {
          setClient(draft.client);
          setReceiver(draft.receiver);
          setSaveReceiverEdits(draft.saveReceiverEdits);
          setItems(draft.items);
        }
        const { data } = await supabase
          .from("products")
          .select(
            "id, description, sat_key, sat_unit, unit_price, iva_rate, tax_object, isr_retencion_rate, iva_retencion_rate",
          )
          .eq("id", resumeProductId)
          .maybeSingle();
        if (data) {
          setItems((prev) => [
            ...prev,
            {
              product_id: data.id,
              sat_key: data.sat_key,
              sat_unit: data.sat_unit,
              description: data.description,
              quantity: 1,
              unit_price: Number(data.unit_price),
              discount: 0,
              iva_rate: Number(data.iva_rate),
              tax_object: data.tax_object === "01" ? "01" : "02",
              isr_retencion_rate:
                data.isr_retencion_rate === null ? null : Number(data.isr_retencion_rate),
              iva_retencion_rate:
                data.iva_retencion_rate === null ? null : Number(data.iva_retencion_rate),
            },
          ]);
          toast.success("Producto creado y agregado a la factura");
        }
        setStep(2);
        clearInvoiceDraft();
      }
      window.history.replaceState({}, "", "/invoices/new");
    })();
  }, []);

  function goCreateProduct() {
    if (!client || !receiver) return;
    saveInvoiceDraft({ client, receiver, saveReceiverEdits, items });
    window.location.href = "/products/new?return_to=invoice";
  }

  async function onIssue() {
    if (!client || !receiver) return;
    if (items.length === 0) {
      toast.error("Agrega al menos un concepto");
      return;
    }
    if (hasErrors(receiverErrors)) {
      toast.error("Revisa los datos fiscales del receptor");
      return;
    }
    if (paymentError) {
      toast.error(paymentError);
      return;
    }
    if (currency !== "MXN" && (!exchangeRate || exchangeRate <= 0)) {
      toast.error("Captura el tipo de cambio para la moneda seleccionada");
      return;
    }

    setIssuing(true);
    try {
      const { data: u, error: userError } = await supabase.auth.getUser();
      if (userError || !u.user)
        throw new Error("Tu sesión no es válida. Inicia sesión nuevamente.");

      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("*")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (companyError) throw companyError;
      if (!company) {
        toast.error("Configura tu perfil del negocio antes de facturar.");
        navigate({ to: "/profile" });
        return;
      }
      if (!company.csd_cer_url || !company.csd_key_url || !company.csd_serial_number) {
        toast.error("Configura tu Certificado de Sello Digital (CSD) antes de timbrar.");
        return;
      }
      if (company.csd_valid_to && new Date(company.csd_valid_to) < new Date()) {
        toast.error("Tu CSD venció. Sube uno vigente antes de timbrar.");
        return;
      }

      // Primero se crea el borrador y sus conceptos. La Edge Function será la única
      // responsable de timbrar, marcar como issued y consumir el timbre.
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          user_id: u.user.id,
          company_id: company.id,
          client_id: client.id,
          client_snapshot: {
            legal_name: receiver.legal_name,
            rfc: receiver.rfc,
            cfdi_use: receiver.cfdi_use,
            tax_regime: receiver.tax_regime,
            postal_code: receiver.postal_code,
            business_category: client.business_category,
          },
          series: "A",
          // Assigned atomically by the database trigger.
          folio: 0,
          status: "draft",
          is_global: isGlobal,
          global_periodicity: isGlobal ? globalPeriodicity : null,
          global_months: isGlobal ? globalMonths : null,
          global_year: isGlobal ? globalYear : null,
          payment_method: paymentMethod,
          payment_form: paymentForm,
          cfdi_use: receiver.cfdi_use,
          currency,
          exchange_rate: currency === "MXN" ? 1 : exchangeRate,
          subtotal: totals.subtotal,
          iva_total: totals.ivaTotal,
          isr_retencion_total: totals.isrRetencionTotal,
          iva_retencion_total: totals.ivaRetencionTotal,
          retentions_total: totals.retentionsTotal,
          total: totals.total,
          notes: `cfdi_type=${cfdiType};export=${exportCode}`,
        })
        .select("id")
        .single();
      if (invoiceError) throw invoiceError;

      const isrPct = taxTreatment?.isrRetencionPct ?? 0;
      const ivaRetPct = taxTreatment?.ivaRetencionPct ?? 0;
      const isPersonaFisica = taxTreatment?.clientType === "persona_fisica";
      const itemRows = items.map((i, idx) => {
        const lineSubtotal = toMoney(i.quantity * i.unit_price - i.discount);
        const isrFraction = isPersonaFisica ? 0 : (i.isr_retencion_rate ?? isrPct / 100);
        const ivaRetFraction =
          isPersonaFisica || i.tax_object === "01" ? 0 : (i.iva_retencion_rate ?? ivaRetPct / 100);
        return {
          invoice_id: invoice.id,
          user_id: u.user.id,
          product_id: i.product_id ?? null,
          sat_key: i.sat_key,
          sat_unit: i.sat_unit,
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount: i.discount,
          iva_rate: i.iva_rate,
          tax_object: i.tax_object,
          iva_amount: (i.quantity * i.unit_price - i.discount) * i.iva_rate,
          isr_retencion_rate: isrFraction,
          isr_retencion_amount: toMoney(lineSubtotal * isrFraction),
          iva_retencion_rate: ivaRetFraction,
          iva_retencion_amount: toMoney(lineSubtotal * ivaRetFraction),
          amount: i.quantity * i.unit_price - i.discount,
          position: idx,
        };
      });

      const { error: itemsError } = await supabase.from("invoice_items").insert(itemRows);
      if (itemsError) {
        await supabase.from("invoices").delete().eq("id", invoice.id).eq("status", "draft");
        throw itemsError;
      }

      if (saveReceiverEdits) {
        const { error: clientUpdateError } = await supabase
          .from("clients")
          .update({
            legal_name: receiver.legal_name,
            tax_regime: receiver.tax_regime,
            postal_code: receiver.postal_code,
            cfdi_use: receiver.cfdi_use,
          })
          .eq("id", client.id);
        if (clientUpdateError)
          console.error("No se pudo actualizar el cliente:", clientUpdateError);
      }

      const { data: stampResult, error: stampFunctionError } = await supabase.functions.invoke(
        "facturama-create-cfdi",
        {
          body: { invoice_id: invoice.id },
        },
      );

      if (stampFunctionError) {
        console.error("Error invoking facturama-create-cfdi:", stampFunctionError);
        throw new Error(
          await getEdgeFunctionErrorMessage(
            stampFunctionError,
            "No fue posible comunicarse con el servicio de facturación.",
          ),
        );
      }

      if (!stampResult?.stamped) {
        console.error("CFDI stamping failed:", stampResult);
        toast.error(stampResult?.reason ?? "No fue posible timbrar la factura.");
        return;
      }

      if (stampResult.stamp_consumed === false) {
        console.error("CFDI stamped but stamp consumption failed:", stampResult);
        toast.warning(
          "La factura fue timbrada correctamente, pero el saldo está pendiente de actualización.",
        );
      } else {
        toast.success("Factura timbrada correctamente");
      }

      // Solo se guarda si el usuario marcó explícitamente "guardar como
      // default" y solo después de un timbrado exitoso — una factura que
      // falla no debe dejar el perfil a medio actualizar.
      if (saveAsDefaultProfile) {
        try {
          await saveInvoiceProfile(u.user.id, company.id, {
            cfdi_type: cfdiType,
            export_code: exportCode,
            currency,
            payment_method: paymentMethod,
            payment_form: paymentForm,
          });
          qc.invalidateQueries({ queryKey: ["invoice-profile", company.id] });
        } catch (profileError) {
          console.error("No se pudo guardar el perfil de facturación:", profileError);
          toast.warning(
            "La factura se emitió, pero no se pudo guardar tu nuevo valor por defecto.",
          );
        }
      }

      const { data: issuedInvoice, error: issuedInvoiceError } = await supabase
        .from("invoices")
        .select("id, series, folio, uuid_fiscal, xml_url, pdf_url")
        .eq("id", invoice.id)
        .single();
      if (issuedInvoiceError) throw issuedInvoiceError;

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["profile"] }),
        qc.invalidateQueries({ queryKey: ["invoices", "history"] }),
        qc.invalidateQueries({ queryKey: ["clients"] }),
      ]);

      setResult({
        id: issuedInvoice.id,
        series: issuedInvoice.series,
        folio: issuedInvoice.folio,
        uuid: issuedInvoice.uuid_fiscal ?? "",
        xmlUrl: issuedInvoice.xml_url ?? "",
        pdfUrl: issuedInvoice.pdf_url ?? "",
      });
      setStep(4);
      setStampSuccessOpen(true);
      playSuccessChime();
    } catch (err) {
      console.error("Invoice issue error:", err);
      toast.error(err instanceof Error ? err.message : "No pudimos emitir la factura");
    } finally {
      setIssuing(false);
    }
  }

  return (
    <div className="px-5 pt-[max(env(safe-area-inset-top),2.5rem)] pb-6">
      <header className="flex items-center gap-3">
        <button
          onClick={() =>
            step > 1 && step < 4 ? setStep((step - 1) as Step) : navigate({ to: "/dashboard" })
          }
          className="grid size-10 place-items-center rounded-full border border-border bg-surface"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Paso {Math.min(step, 3)} de 3
          </p>
          <h1 className="text-lg font-bold tracking-tight">
            {step === 1
              ? "Selecciona cliente"
              : step === 2
                ? "Agrega conceptos"
                : step === 3
                  ? "Revisa y emite"
                  : "Factura emitida"}
          </h1>
        </div>
      </header>

      <div className="mt-4 flex gap-1.5">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className={`h-1 flex-1 rounded-full ${n <= Math.min(step, 3) ? "bg-foreground" : "bg-muted"}`}
          />
        ))}
      </div>

      <div className="mt-6">
        {step === 1 && (
          <StepClient
            onPick={pickClient}
            onPickPublicoGeneral={pickPublicoGeneral}
            findingPublicoGeneral={findingPublicoGeneral}
          />
        )}
        {step === 2 && (
          <StepItems
            items={items}
            setItems={setItems}
            onCreateProduct={goCreateProduct}
            clientType={taxTreatment?.clientType}
            onNext={() =>
              items.length > 0 ? setStep(3) : toast.error("Agrega al menos un concepto")
            }
          />
        )}
        {step === 3 && client && receiver && (
          <StepReview
            issuer={issuer}
            client={client}
            receiver={receiver}
            setReceiver={setReceiver}
            receiverErrors={receiverErrors}
            saveReceiverEdits={saveReceiverEdits}
            setSaveReceiverEdits={setSaveReceiverEdits}
            isGlobal={isGlobal}
            globalPeriodicity={globalPeriodicity}
            setGlobalPeriodicity={setGlobalPeriodicity}
            globalMonths={globalMonths}
            setGlobalMonths={setGlobalMonths}
            globalYear={globalYear}
            setGlobalYear={setGlobalYear}
            items={items}
            totals={totals}
            cfdiType={cfdiType}
            setCfdiType={setCfdiType}
            paymentMethod={paymentMethod}
            paymentForm={paymentForm}
            setPaymentMethod={setPaymentMethod}
            setPaymentForm={setPaymentForm}
            paymentError={paymentError}
            currency={currency}
            setCurrency={setCurrency}
            exchangeRate={exchangeRate}
            setExchangeRate={setExchangeRate}
            exportCode={exportCode}
            setExportCode={setExportCode}
            advancedOpen={advancedInvoiceOpen}
            setAdvancedOpen={setAdvancedInvoiceOpen}
            saveAsDefault={saveAsDefaultProfile}
            setSaveAsDefault={setSaveAsDefaultProfile}
            onIssue={onIssue}
            issuing={issuing}
          />
        )}
        {step === 4 && result && (
          <StepSuccess result={result} total={totals.total} clientPhone={client?.phone ?? null} />
        )}
      </div>

      <TimbradoSuccessOverlay
        open={stampSuccessOpen}
        onClose={() => setStampSuccessOpen(false)}
        folioFiscal={result?.uuid}
      />
    </div>
  );
}

/* -------- Step 1: Client -------- */
function StepClient({
  onPick,
  onPickPublicoGeneral,
  findingPublicoGeneral,
}: {
  onPick: (c: ClientRow) => void;
  onPickPublicoGeneral: () => void;
  findingPublicoGeneral: boolean;
}) {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["clients", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, legal_name, rfc, tax_regime, postal_code, cfdi_use, email, phone, is_technology_platform, business_category",
        )
        .order("is_favorite", { ascending: false })
        .order("legal_name");
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });
  const filtered = (data ?? []).filter(
    (c) =>
      !q ||
      c.legal_name.toLowerCase().includes(q.toLowerCase()) ||
      c.rfc.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por RFC o nombre…"
          className="w-full rounded-2xl border border-input bg-surface py-3 pl-11 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring"
        />
      </div>
      <a
        href="/clients/new?return_to=invoice"
        className="mt-3 flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border bg-surface py-3 text-sm font-semibold text-primary"
      >
        <Plus className="size-4" /> Crear nuevo cliente
      </a>
      <button
        type="button"
        onClick={onPickPublicoGeneral}
        disabled={findingPublicoGeneral}
        className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left transition active:scale-[0.99] disabled:opacity-60"
      >
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
          {findingPublicoGeneral ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Users className="size-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Venta a público en general</p>
          <p className="text-xs text-muted-foreground">
            Factura global, sin datos fiscales del cliente
          </p>
        </div>
        <ArrowRight className="size-4 text-muted-foreground" />
      </button>
      <div className="mt-4">
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-2xl border border-border bg-surface"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sin clientes que coincidan.
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => onPick(c)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left transition active:scale-[0.99]"
                >
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold uppercase text-primary">
                    {c.legal_name.slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.legal_name}</p>
                    <p className="font-mono text-[10px] uppercase text-muted-foreground">{c.rfc}</p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* -------- Step 2: Items -------- */
function StepItems({
  items,
  setItems,
  onCreateProduct,
  clientType,
  onNext,
}: {
  items: LineItem[];
  setItems: (i: LineItem[]) => void;
  onCreateProduct: () => void;
  clientType: string | undefined;
  onNext: () => void;
}) {
  // El catálogo es el estado inicial del paso: no se requiere tocar
  // "Agregar concepto" para verlo.
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // Un producto agregado desde el catálogo ya trae sus datos fiscales
  // correctos, así que se muestra colapsado (solo nombre, cantidad y
  // subtotal) y no obliga a revisar clave SAT/unidad/IVA cada vez. Un
  // concepto manual sí necesita esos datos, así que se abre expandido.
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const { data: products } = useQuery({
    queryKey: ["products", "picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, description, sat_key, sat_unit, unit_price, iva_rate, tax_object, isr_retencion_rate, iva_retencion_rate, category, image_url",
        )
        .eq("is_active", true)
        .order("description");
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  // El catálogo de cada negocio es acotado (RLS lo limita a sus propios
  // productos), así que filtrar en cliente sobre la lista ya cargada evita
  // una consulta por cada tecleo. El debounce solo suaviza el re-render.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 280);
    return () => clearTimeout(t);
  }, [query]);

  const filteredProducts = useMemo(() => {
    const list = products ?? [];
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => p.description.toLowerCase().includes(q));
  }, [products, debouncedQuery]);

  function openCatalog() {
    setQuery("");
    setOpen(true);
  }

  function closeCatalog() {
    setQuery("");
    setOpen(false);
  }

  function addProduct(p: ProductRow) {
    setItems([
      ...items,
      {
        product_id: p.id,
        sat_key: p.sat_key,
        sat_unit: p.sat_unit,
        description: p.description,
        quantity: 1,
        unit_price: Number(p.unit_price),
        discount: 0,
        iva_rate: Number(p.iva_rate),
        tax_object: p.tax_object === "01" ? "01" : "02",
        isr_retencion_rate: p.isr_retencion_rate === null ? null : Number(p.isr_retencion_rate),
        iva_retencion_rate: p.iva_retencion_rate === null ? null : Number(p.iva_retencion_rate),
      },
    ]);
    closeCatalog();
  }

  function addManual() {
    setExpandedIdx(items.length);
    setItems([
      ...items,
      {
        sat_key: "01010101",
        sat_unit: "E48",
        description: "",
        quantity: 1,
        unit_price: 0,
        discount: 0,
        iva_rate: 0.16,
        tax_object: "02",
        isr_retencion_rate: null,
        iva_retencion_rate: null,
      },
    ]);
    closeCatalog();
  }

  function update(idx: number, patch: Partial<LineItem>) {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function remove(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
    setExpandedIdx((cur) => (cur === null ? null : cur === idx ? null : cur > idx ? cur - 1 : cur));
  }

  return (
    <div className="space-y-3">
      {items.map((it, idx) =>
        idx !== expandedIdx ? (
          <div
            key={idx}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {it.description || "Sin descripción"}
              </p>
              <p className="text-xs text-muted-foreground">
                {it.quantity} × {formatMXN(it.unit_price)}
              </p>
            </div>
            <span className="shrink-0 text-sm font-bold">
              {formatMXN(it.quantity * it.unit_price - it.discount)}
            </span>
            <button
              onClick={() => setExpandedIdx(idx)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-4" />
            </button>
            <button
              onClick={() => remove(idx)}
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ) : (
          <div key={idx} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <input
                value={it.description}
                onChange={(e) => update(idx, { description: e.target.value })}
                placeholder="Descripción"
                className="flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground"
              />
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => setExpandedIdx(null)}
                  className="text-xs font-semibold text-primary"
                >
                  Listo
                </button>
                <button
                  onClick={() => remove(idx)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Mini label="Cant.">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={it.quantity}
                  onChange={(e) => update(idx, { quantity: Number(e.target.value) })}
                  onFocus={(e) => e.target.select()}
                  className="ff-mini"
                />
              </Mini>
              <Mini label="Precio">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={it.unit_price}
                  onChange={(e) => update(idx, { unit_price: Number(e.target.value) })}
                  onFocus={(e) => e.target.select()}
                  className="ff-mini"
                />
              </Mini>
              <Mini label="Desc.">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={it.discount}
                  onChange={(e) => update(idx, { discount: Number(e.target.value) })}
                  onFocus={(e) => e.target.select()}
                  className="ff-mini"
                />
              </Mini>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Mini label="Clave SAT">
                <select
                  value={it.sat_key}
                  onChange={(e) => update(idx, { sat_key: e.target.value })}
                  className="ff-mini"
                >
                  {COMMON_SAT_KEYS.map((k) => (
                    <option key={k.code} value={k.code}>
                      {k.code}
                    </option>
                  ))}
                </select>
              </Mini>
              <Mini label="Unidad">
                <select
                  value={it.sat_unit}
                  onChange={(e) => update(idx, { sat_unit: e.target.value })}
                  className="ff-mini"
                >
                  {COMMON_SAT_UNITS.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.code}
                    </option>
                  ))}
                </select>
              </Mini>
              <Mini label="IVA">
                {it.tax_object === "01" ? (
                  <p className="ff-mini flex items-center text-muted-foreground">No objeto</p>
                ) : (
                  <select
                    value={it.iva_rate}
                    onChange={(e) => update(idx, { iva_rate: Number(e.target.value) })}
                    className="ff-mini"
                  >
                    <option value={0.16}>16%</option>
                    <option value={0.08}>8%</option>
                    <option value={0}>0%</option>
                  </select>
                )}
              </Mini>
            </div>
            {(it.isr_retencion_rate !== null || it.iva_retencion_rate !== null) && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Retención fija de este producto: ISR {formatPct((it.isr_retencion_rate ?? 0) * 100)}{" "}
                · IVA {formatPct((it.iva_retencion_rate ?? 0) * 100)}
                {clientType === "persona_fisica" && " (no aplica: el receptor es persona física)"}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">Importe</span>
              <span className="font-bold">
                {formatMXN(it.quantity * it.unit_price - it.discount)}
              </span>
            </div>
          </div>
        ),
      )}

      {open ? (
        <div className="rounded-2xl border border-border bg-surface p-3">
          <p className="mb-2 px-1 text-xs font-semibold uppercase text-muted-foreground">
            Elige del catálogo
          </p>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto o servicio…"
              className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring"
            />
          </div>
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-2.5 text-left transition-colors hover:bg-accent"
              >
                <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.description} className="size-full object-cover" />
                  ) : (
                    <Package className="size-5 text-muted-foreground/60" strokeWidth={1.4} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.description}</p>
                  {p.category ? (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <Folder className="size-3 shrink-0" /> {p.category}
                    </p>
                  ) : (
                    <p className="mt-0.5 truncate font-mono text-[10px] uppercase text-muted-foreground">
                      SAT {p.sat_key} · {p.sat_unit}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-sm font-bold">{formatMXN(p.unit_price)}</span>
              </button>
            ))}
            {filteredProducts.length === 0 && (products ?? []).length > 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                Sin productos que coincidan con “{query.trim()}”.
              </p>
            )}
            {(products ?? []).length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                Tu catálogo está vacío.
              </p>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={addManual}
              className="rounded-xl border border-border bg-background py-2 text-xs font-semibold"
            >
              Agregar manual
            </button>
            <button
              onClick={onCreateProduct}
              className="rounded-xl border border-dashed border-primary/40 bg-background py-2 text-xs font-semibold text-primary"
            >
              Crear producto nuevo
            </button>
          </div>
          <button
            onClick={closeCatalog}
            className="mt-2 w-full rounded-xl bg-muted py-2 text-xs font-semibold text-muted-foreground"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          onClick={openCatalog}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border bg-surface py-3 text-sm font-semibold text-primary"
        >
          <Plus className="size-4" /> Agregar concepto
        </button>
      )}

      <button
        onClick={onNext}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground py-4 text-sm font-semibold text-background transition active:scale-[0.98]"
      >
        Continuar <ArrowRight className="size-4" />
      </button>

      <style>{`.ff-mini{width:100%;border-radius:0.75rem;border:1px solid var(--input);background:var(--background);padding:0.5rem 0.625rem;font-size:0.8rem;outline:none;font-family:var(--font-mono)}.ff-mini:focus{border-color:var(--primary)}`}</style>
    </div>
  );
}

function Mini({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
      {error && (
        <span className="mt-1 block text-[10px] font-medium text-destructive">{error}</span>
      )}
    </label>
  );
}

/* -------- Step 3: Review -------- */
type StepReviewProps = {
  issuer:
    | {
        rfc?: string;
        legal_name?: string;
        postal_code?: string | null;
        tax_regime?: string | null;
      }
    | null
    | undefined;
  client: ClientRow;
  receiver: ReceiverProfile;
  setReceiver: (r: ReceiverProfile) => void;
  receiverErrors: FieldErrors;
  saveReceiverEdits: boolean;
  setSaveReceiverEdits: (v: boolean) => void;
  isGlobal: boolean;
  globalPeriodicity: string;
  setGlobalPeriodicity: (v: string) => void;
  globalMonths: string;
  setGlobalMonths: (v: string) => void;
  globalYear: number;
  setGlobalYear: (v: number) => void;
  items: LineItem[];
  totals: {
    subtotal: number;
    ivaTotal: number;
    isrRetencionTotal: number;
    ivaRetencionTotal: number;
    retentionsTotal: number;
    total: number;
  };
  cfdiType: string;
  setCfdiType: (v: string) => void;
  paymentMethod: string;
  paymentForm: string;
  setPaymentMethod: (v: string) => void;
  setPaymentForm: (v: string) => void;
  paymentError: string | null;
  currency: string;
  setCurrency: (v: string) => void;
  exchangeRate: number;
  setExchangeRate: (v: number) => void;
  exportCode: string;
  setExportCode: (v: string) => void;
  advancedOpen: boolean;
  setAdvancedOpen: (v: boolean) => void;
  saveAsDefault: boolean;
  setSaveAsDefault: (v: boolean) => void;
  onIssue: () => void;
  issuing: boolean;
};

function StepReview(props: StepReviewProps) {
  const {
    issuer,
    client,
    receiver,
    setReceiver,
    receiverErrors,
    saveReceiverEdits,
    setSaveReceiverEdits,
    isGlobal,
    globalPeriodicity,
    setGlobalPeriodicity,
    globalMonths,
    setGlobalMonths,
    globalYear,
    setGlobalYear,
    items,
    totals,
    cfdiType,
    setCfdiType,
    paymentMethod,
    paymentForm,
    setPaymentMethod,
    setPaymentForm,
    paymentError,
    currency,
    setCurrency,
    exchangeRate,
    setExchangeRate,
    exportCode,
    setExportCode,
    advancedOpen,
    setAdvancedOpen,
    saveAsDefault,
    setSaveAsDefault,
    onIssue,
    issuing,
  } = props;

  const [editReceiver, setEditReceiver] = useState(false);
  const [editGlobal, setEditGlobal] = useState(false);
  const receiverBlocking = hasErrors(receiverErrors);
  const allowedUses = useMemo(() => cfdiUsesForRegime(receiver.tax_regime), [receiver.tax_regime]);
  const isEditedFromClient =
    receiver.legal_name !== normalizeFiscalName(client.legal_name) ||
    receiver.tax_regime !== client.tax_regime ||
    receiver.postal_code !== client.postal_code ||
    receiver.cfdi_use !== (client.cfdi_use ?? receiver.cfdi_use);

  // Autoabre edición si el perfil viene incompleto
  useEffect(() => {
    if (receiverBlocking) setEditReceiver(true);
  }, [receiverBlocking]);

  // Misma lógica que arriba: si "Método" (escondido en Opciones avanzadas)
  // queda en una combinación inválida con la Forma de pago, se revela en
  // vez de esconder el error.
  useEffect(() => {
    if (paymentError) setAdvancedOpen(true);
  }, [paymentError, setAdvancedOpen]);

  function upd<K extends keyof ReceiverProfile>(k: K, v: ReceiverProfile[K]) {
    const next = { ...receiver, [k]: v };
    // Si cambia el régimen y el uso ya no aplica, resetea el uso.
    if (k === "tax_regime") {
      const allowed = cfdiUsesForRegime(v as string).map((x) => x.code);
      if (next.cfdi_use && !allowed.includes(next.cfdi_use)) next.cfdi_use = null;
    }
    setReceiver(next);
  }

  return (
    <div className="space-y-4">
      {/* Emisor */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Emisor
        </p>
        <p className="mt-1 truncate font-semibold">{issuer?.legal_name ?? "Configura tu perfil"}</p>
        <p className="font-mono text-xs text-muted-foreground">
          {issuer?.rfc ?? "—"} · CP {issuer?.postal_code ?? "—"} · Régimen{" "}
          {issuer?.tax_regime ?? "—"}
        </p>
      </div>

      {/* Receptor */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Receptor
        </p>
        <p className="mt-1 truncate font-semibold">{receiver.legal_name || "—"}</p>
        <p className="font-mono text-xs text-muted-foreground">{receiver.rfc}</p>

        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <MiniStat label="Régimen" value={receiver.tax_regime ?? "—"} />
          <MiniStat label="CP" value={receiver.postal_code ?? "—"} />
        </div>

        <div className="mt-3">
          <Mini label="Uso CFDI" error={receiverErrors.cfdi_use}>
            <select
              value={receiver.cfdi_use ?? ""}
              onChange={(e) => upd("cfdi_use", e.target.value || null)}
              className="ff-mini"
            >
              <option value="">Selecciona…</option>
              {(allowedUses.length ? allowedUses : CFDI_USES).map((u) => (
                <option key={u.code} value={u.code}>
                  {u.code} — {u.name}
                </option>
              ))}
            </select>
          </Mini>
        </div>

        <button
          type="button"
          onClick={() => setEditReceiver(!editReceiver)}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary"
        >
          <Pencil className="size-3" />{" "}
          {editReceiver ? "Ocultar opciones avanzadas" : "Opciones avanzadas"}
        </button>

        {editReceiver && (
          <div className="mt-3 space-y-2.5 border-t border-border pt-3">
            <Mini
              label="Nombre / razón social (como en la constancia)"
              error={receiverErrors.legal_name}
            >
              <input
                value={receiver.legal_name}
                onChange={(e) => upd("legal_name", e.target.value)}
                onBlur={(e) => upd("legal_name", normalizeFiscalName(e.target.value))}
                className="ff-mini"
                placeholder="MI EMPRESA EJEMPLO"
              />
            </Mini>
            <div className="grid grid-cols-2 gap-2">
              <Mini label="Régimen fiscal" error={receiverErrors.tax_regime}>
                <select
                  value={receiver.tax_regime ?? ""}
                  onChange={(e) => upd("tax_regime", e.target.value || null)}
                  className="ff-mini"
                >
                  <option value="">Selecciona…</option>
                  {TAX_REGIMES.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.code} — {r.name}
                    </option>
                  ))}
                </select>
              </Mini>
              <Mini label="Código postal" error={receiverErrors.postal_code}>
                <input
                  value={receiver.postal_code ?? ""}
                  onChange={(e) =>
                    upd("postal_code", e.target.value.replace(/\D/g, "").slice(0, 5))
                  }
                  inputMode="numeric"
                  maxLength={5}
                  className="ff-mini font-mono"
                  placeholder="00000"
                />
              </Mini>
            </div>

            {isEditedFromClient && (
              <label className="mt-1 flex items-center gap-2 rounded-xl bg-primary-soft/60 px-3 py-2 text-[11px]">
                <input
                  type="checkbox"
                  checked={saveReceiverEdits}
                  onChange={(e) => setSaveReceiverEdits(e.target.checked)}
                  className="size-4 accent-[var(--primary)]"
                />
                <span>
                  <Save className="mr-1 inline size-3 -mt-0.5" />
                  Guardar estos cambios en el perfil del cliente
                </span>
              </label>
            )}
          </div>
        )}
      </div>

      {/* Factura Global: periodicidad/mes/año */}
      {isGlobal && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Factura global
              </p>
              <p className="mt-1 font-semibold">Periodicidad, mes y año</p>
            </div>
            <button
              type="button"
              onClick={() => setEditGlobal((v) => !v)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-3" /> {editGlobal ? "Ocultar" : "Editar"}
            </button>
          </div>

          {!editGlobal && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
              <MiniStat
                label="Periodicidad"
                value={GLOBAL_PERIODICITIES.find((p) => p.code === globalPeriodicity)?.name ?? "—"}
              />
              <MiniStat
                label="Mes"
                value={GLOBAL_MONTHS.find((m) => m.code === globalMonths)?.name ?? "—"}
              />
              <MiniStat label="Año" value={String(globalYear)} />
            </div>
          )}

          {editGlobal && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Mini label="Periodicidad">
                <select
                  value={globalPeriodicity}
                  onChange={(e) => setGlobalPeriodicity(e.target.value)}
                  className="ff-mini"
                >
                  {GLOBAL_PERIODICITIES.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Mini>
              <Mini label="Mes">
                <select
                  value={globalMonths}
                  onChange={(e) => setGlobalMonths(e.target.value)}
                  className="ff-mini"
                >
                  {GLOBAL_MONTHS.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Mini>
              <Mini label="Año">
                <input
                  type="number"
                  value={globalYear}
                  onChange={(e) => setGlobalYear(Number(e.target.value))}
                  onFocus={(e) => e.target.select()}
                  className="ff-mini font-mono"
                />
              </Mini>
            </div>
          )}
        </div>
      )}

      {/* Datos del comprobante */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Datos del comprobante
        </p>

        <Mini
          label="Forma de pago"
          error={paymentError && paymentMethod !== "PPD" ? paymentError : undefined}
        >
          <select
            value={paymentForm}
            onChange={(e) => setPaymentForm(e.target.value)}
            className="ff-mini"
          >
            {PAYMENT_FORMS.map((f) => (
              <option key={f.code} value={f.code}>
                {f.code} — {f.name}
              </option>
            ))}
          </select>
        </Mini>

        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary"
        >
          <Pencil className="size-3" />{" "}
          {advancedOpen ? "Ocultar opciones avanzadas" : "Opciones avanzadas"}
        </button>

        {advancedOpen && (
          <div className="mt-3 space-y-2.5 border-t border-border pt-3">
            <div className="grid grid-cols-2 gap-2">
              <Mini label="Tipo de comprobante">
                <select
                  value={cfdiType}
                  onChange={(e) => setCfdiType(e.target.value)}
                  className="ff-mini"
                >
                  {CFDI_TYPES.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.code} — {t.name}
                    </option>
                  ))}
                </select>
              </Mini>
              <Mini label="Exportación">
                <select
                  value={exportCode}
                  onChange={(e) => setExportCode(e.target.value)}
                  className="ff-mini"
                >
                  {EXPORT_CODES.map((e2) => (
                    <option key={e2.code} value={e2.code}>
                      {e2.code} — {e2.name}
                    </option>
                  ))}
                </select>
              </Mini>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Mini label="Moneda">
                <select
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value);
                    if (e.target.value === "MXN") setExchangeRate(1);
                  }}
                  className="ff-mini"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </Mini>
              {currency !== "MXN" && (
                <Mini label={`T. cambio ${currency}→MXN`}>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(Number(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    className="ff-mini font-mono"
                  />
                </Mini>
              )}
            </div>
            <Mini
              label="Método"
              error={paymentError && paymentMethod === "PPD" ? paymentError : undefined}
            >
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="ff-mini"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
            </Mini>

            <label className="mt-1 flex items-center gap-2 rounded-xl bg-primary-soft/60 px-3 py-2 text-[11px]">
              <input
                type="checkbox"
                checked={saveAsDefault}
                onChange={(e) => setSaveAsDefault(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              <span>
                <Save className="mr-1 inline size-3 -mt-0.5" />
                Guardar como mi valor por defecto de facturación
              </span>
            </label>
          </div>
        )}
      </div>

      {/* Conceptos + totales */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Conceptos ({items.length})
        </p>
        <ul className="divide-y divide-border">
          {items.map((it, i) => (
            <li key={i} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-mono text-[10px] text-muted-foreground">x{it.quantity}</span>{" "}
                {it.description || "—"}
              </span>
              <span className="font-bold">
                {formatMXN(it.quantity * it.unit_price - it.discount)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
          <Row label="Subtotal" value={formatMXN(totals.subtotal)} />
          <Row label="IVA" value={formatMXN(totals.ivaTotal)} />
          {totals.isrRetencionTotal > 0 && (
            <Row
              label={`Retención ISR (${formatPct(
                totals.subtotal > 0 ? (totals.isrRetencionTotal / totals.subtotal) * 100 : 0,
              )})`}
              value={`-${formatMXN(totals.isrRetencionTotal)}`}
            />
          )}
          {totals.ivaRetencionTotal > 0 && (
            <Row
              label={`Retención IVA (${formatPct(
                totals.subtotal > 0 ? (totals.ivaRetencionTotal / totals.subtotal) * 100 : 0,
              )})`}
              value={`-${formatMXN(totals.ivaRetencionTotal)}`}
            />
          )}
          <Row label="Total" value={formatMXN(totals.total)} bold />
        </div>
        {totals.retentionsTotal > 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <AlertCircle className="mt-0.5 size-3 shrink-0" />
            Tu cliente retiene estos montos por ley al pagarte; se restan del total que cobras, pero
            es dinero que tu cliente entera al SAT a tu nombre.
          </p>
        )}
      </div>

      {(receiverBlocking || paymentError) && (
        <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>Corrige los campos marcados en rojo antes de emitir.</span>
        </div>
      )}

      <button
        onClick={onIssue}
        disabled={issuing || receiverBlocking || !!paymentError}
        className={`mx-auto flex items-center justify-center gap-2 bg-foreground text-sm font-semibold text-background transition-all duration-300 active:scale-[0.98] disabled:opacity-50 ${
          issuing ? "aspect-square w-[88px] rounded-full py-0" : "w-full rounded-2xl py-4"
        }`}
      >
        {issuing ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <>
            Emitir factura <Check className="size-4" />
          </>
        )}
      </button>
      <style>{`.ff-mini{width:100%;border-radius:0.75rem;border:1px solid var(--input);background:var(--background);padding:0.5rem 0.625rem;font-size:0.8rem;outline:none}.ff-mini:focus{border-color:var(--primary);box-shadow:0 0 0 3px var(--ring)}`}</style>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-2.5 py-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-xs font-semibold">{value}</p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between ${bold ? "text-base font-bold" : "text-muted-foreground"}`}
    >
      <span>{label}</span>
      <span className={bold ? "text-foreground" : ""}>{value}</span>
    </div>
  );
}

/* -------- Step 4: Success -------- */
function StepSuccess({
  result,
  total,
  clientPhone,
}: {
  result: {
    id: string;
    series: string;
    folio: number;
    uuid: string;
    xmlUrl: string;
    pdfUrl: string;
  };
  total: number;
  clientPhone: string | null;
}) {
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const folioFmt = `${result.series}-${String(result.folio).padStart(6, "0")}`;

  async function sendWhatsApp() {
    setSendingWhatsApp(true);
    try {
      await shareInvoiceOnWhatsApp(
        result.pdfUrl,
        `Factura ${folioFmt} por ${formatMXN(total)}`,
        clientPhone,
        `Factura-${folioFmt}.pdf`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos preparar el envío");
    } finally {
      setSendingWhatsApp(false);
    }
  }

  return (
    <div className="py-6 text-center">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-success/10 text-success">
        <FileCheck2 className="size-7" />
      </div>
      <h2 className="mt-5 text-2xl font-bold tracking-tight">¡Factura emitida!</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Folio{" "}
        <span className="font-mono font-semibold text-foreground">
          {result.series}-{String(result.folio).padStart(6, "0")}
        </span>
      </p>
      <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
        UUID: {result.uuid}
      </p>

      <div className="mt-8 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() =>
            openInvoiceDocument(result.xmlUrl).catch((error) => toast.error(error.message))
          }
          className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-surface p-4 text-xs font-semibold"
        >
          <Download className="size-5 text-primary" /> XML
        </button>
        <button
          type="button"
          onClick={() =>
            openInvoiceDocument(result.pdfUrl).catch((error) => toast.error(error.message))
          }
          className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-surface p-4 text-xs font-semibold"
        >
          <Download className="size-5 text-primary" /> PDF
        </button>
        <button
          type="button"
          onClick={sendWhatsApp}
          disabled={sendingWhatsApp}
          className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-surface p-4 text-xs font-semibold disabled:opacity-60"
        >
          {sendingWhatsApp ? (
            <Loader2 className="size-5 animate-spin text-primary" />
          ) : (
            <Share2 className="size-5 text-primary" />
          )}
          Enviar
        </button>
      </div>

      <Link
        to="/dashboard"
        className="mt-8 inline-flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background"
      >
        <Home className="size-4" /> Volver al inicio
      </Link>
    </div>
  );
}
