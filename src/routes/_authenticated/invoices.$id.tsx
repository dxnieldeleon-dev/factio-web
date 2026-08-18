import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Copy,
  Download,
  Share2,
  Ban,
  Loader2,
  Send,
  Pencil,
  Trash2,
  CopyPlus,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionErrorMessage } from "@/lib/edge-function-errors";
import { formatMXN, formatDateMX } from "@/lib/format";
import { openInvoiceDocument, shareInvoiceOnWhatsApp } from "@/lib/invoice-documents";
import { readDuplicateWarnings, runDuplicateFromInvoice } from "@/lib/duplicate-invoice-ui";
import { playSuccessChime } from "@/lib/success-chime";
import { TimbradoSuccessOverlay } from "@/components/TimbradoSuccessOverlay";
import { StatusChip } from "./dashboard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Mismo redondeo de moneda que usa la Edge Function facturama-create-cfdi;
// los totales guardados deben coincidir bit a bit con lo que ella recalcula.
function toMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const IVA_RATE_OPTIONS = [
  { value: 0.16, label: "16%" },
  { value: 0.08, label: "8%" },
  { value: 0, label: "0%" },
];

// Tasas confirmadas para 2026 (ver supabase/migrations/20260731020000_tax_withholding_rules.sql).
const ISR_RETENCION_OPTIONS = [
  { value: 0, label: "0% (sin retención)" },
  { value: 1.25, label: "1.25% (RESICO 626 → persona moral)" },
  { value: 10, label: "10% (Actividad Empresarial 612 → persona moral)" },
];
const IVA_RETENCION_OPTIONS = [
  { value: 0, label: "0% (sin retención)" },
  { value: 10.6667, label: "10.6667% (persona moral, 612 o 626)" },
];

export const Route = createFileRoute("/_authenticated/invoices/$id")({
  component: InvoiceDetail,
});

const CANCEL_REASONS = [
  { code: "01", label: "01 — Comprobante emitido con errores con relación" },
  { code: "02", label: "02 — Comprobante emitido con errores sin relación" },
  { code: "03", label: "03 — No se llevó a cabo la operación" },
  { code: "04", label: "04 — Operación nominativa relacionada en una factura global" },
];

async function loadInvoice(id: string) {
  const [invRes, itemsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, series, folio, total, subtotal, iva_total, isr_retencion_total, iva_retencion_total, retentions_total, status, created_at, issued_at, uuid_fiscal, client_snapshot, xml_url, pdf_url, payment_method, payment_form, cfdi_use, currency, cancellation_reason, cancellation_status, cancellation_requested_at, cancellation_replacement_uuid, cancelled_at, client_id, clients(phone, email), stamping_status, stamping_error, email_sent_at, email_last_error",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("invoice_items")
      .select(
        "id, description, quantity, unit_price, discount, iva_rate, iva_amount, isr_retencion_rate, isr_retencion_amount, iva_retencion_rate, iva_retencion_amount, amount, sat_key, sat_unit",
      )
      .eq("invoice_id", id)
      .order("position"),
  ]);
  if (invRes.error) throw invRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (!invRes.data) throw new Error("Factura no encontrada");
  return { invoice: invRes.data, items: itemsRes.data ?? [] };
}

function InvoiceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => loadInvoice(id),
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState(CANCEL_REASONS[0].code);
  const [replacementUuid, setReplacementUuid] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [verifyingCancellation, setVerifyingCancellation] = useState(false);
  const [stamping, setStamping] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [taxDialogOpen, setTaxDialogOpen] = useState(false);
  const [itemIvaRates, setItemIvaRates] = useState<Record<string, number>>({});
  const [isrRetencionPct, setIsrRetencionPct] = useState(0);
  const [ivaRetencionPct, setIvaRetencionPct] = useState(0);
  const [savingTaxes, setSavingTaxes] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [stampSuccessOpen, setStampSuccessOpen] = useState(false);
  const [stampedUuid, setStampedUuid] = useState<string | null>(null);

  // Si esta pantalla es el destino de una duplicación reciente, muestra los
  // avisos de cambio de precio que quedaron guardados justo antes de
  // navegar aquí (ver runDuplicateFromInvoice en duplicate-invoice-ui.ts).
  useEffect(() => {
    const warnings = readDuplicateWarnings(id);
    if (!warnings || warnings.length === 0) return;
    for (const w of warnings) {
      toast.warning(
        `El precio de ${w.description} cambió de ${formatMXN(w.old_price)} a ${formatMXN(w.current_price)} desde tu última factura`,
      );
    }
  }, [id]);

  async function duplicate() {
    if (!data) return;
    setDuplicating(true);
    try {
      const result = await runDuplicateFromInvoice(data.invoice.id);
      qc.invalidateQueries({ queryKey: ["invoices", "history"] });
      if (result) navigate({ to: "/invoices/$id", params: { id: result.invoiceId } });
    } finally {
      setDuplicating(false);
    }
  }

  const folioFmt = data
    ? data.invoice.status === "draft"
      ? "Borrador"
      : `${data.invoice.series}-${String(data.invoice.folio).padStart(6, "0")}`
    : "";

  async function sendWhatsApp() {
    if (!data?.invoice.pdf_url) return;
    setSendingWhatsApp(true);
    try {
      await shareInvoiceOnWhatsApp(
        data.invoice.pdf_url,
        `Factura ${folioFmt} por ${formatMXN(data.invoice.total)}`,
        data.invoice.clients?.phone,
        `Factura-${folioFmt}.pdf`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos preparar el envío");
    } finally {
      setSendingWhatsApp(false);
    }
  }

  async function sendInvoiceEmail() {
    if (!data) return;
    setSendingEmail(true);
    try {
      const { data: response, error } = await supabase.functions.invoke("send-invoice-email", {
        body: { invoice_id: data.invoice.id },
      });
      if (error) {
        throw new Error(
          await getEdgeFunctionErrorMessage(error, "No fue posible enviar el correo."),
        );
      }
      if (!response?.ok) {
        throw new Error(response?.reason ?? "No fue posible enviar el correo.");
      }
      toast.success("Factura enviada por correo");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos enviar el correo");
    } finally {
      setSendingEmail(false);
    }
  }

  async function verifyCancellation() {
    if (!data) return;
    setVerifyingCancellation(true);
    try {
      const { data: response, error } = await supabase.functions.invoke(
        "facturama-check-cancellation",
        { body: { invoice_id: data.invoice.id } },
      );
      if (error) {
        throw new Error(
          await getEdgeFunctionErrorMessage(error, "No fue posible verificar el estado."),
        );
      }
      if (!response?.ok) {
        throw new Error(response?.reason ?? "No fue posible verificar el estado.");
      }
      if (response.resolved && response.cancelled) {
        toast.success("El receptor aceptó la cancelación: factura cancelada.");
        qc.invalidateQueries({ queryKey: ["invoices", "history"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
        await refetch();
      } else if (response.overdue) {
        toast.info(
          "El plazo esperado ya venció; confirma el estado en el Buzón Tributario del SAT.",
        );
      } else {
        toast.info("El receptor aún no responde. Sigue pendiente.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos verificar el estado");
    } finally {
      setVerifyingCancellation(false);
    }
  }

  async function copyUuid() {
    if (!data?.invoice.uuid_fiscal) return;
    try {
      await navigator.clipboard.writeText(data.invoice.uuid_fiscal);
      toast.success("UUID copiado");
    } catch {
      toast.error("No pudimos copiar");
    }
  }

  async function stampDraft() {
    if (!data) return;
    setStamping(true);
    try {
      const { data: stampResult, error: stampFunctionError } = await supabase.functions.invoke(
        "facturama-create-cfdi",
        { body: { invoice_id: data.invoice.id } },
      );
      if (stampFunctionError) {
        throw new Error(
          await getEdgeFunctionErrorMessage(
            stampFunctionError,
            "No fue posible comunicarse con el servicio de facturación.",
          ),
        );
      }
      if (!stampResult?.stamped) {
        toast.error(stampResult?.reason ?? "No fue posible timbrar la factura.");
        return;
      }
      toast.success("Factura timbrada correctamente");
      setStampedUuid(typeof stampResult.uuid === "string" ? stampResult.uuid : null);
      setStampSuccessOpen(true);
      playSuccessChime();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["profile"] }),
        qc.invalidateQueries({ queryKey: ["invoices", "history"] }),
      ]);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos timbrar la factura");
    } finally {
      setStamping(false);
    }
  }

  async function deleteDraft() {
    if (!data) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("id", data.invoice.id)
        .eq("status", "draft");
      if (error) throw error;
      toast.success("Borrador eliminado");
      setDeleteOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["invoices", "history"] }),
      ]);
      navigate({ to: "/history" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos eliminar el borrador");
    } finally {
      setDeleting(false);
    }
  }

  function openTaxDialog() {
    if (!data) return;
    setItemIvaRates(Object.fromEntries(data.items.map((item) => [item.id, Number(item.iva_rate)])));
    setIsrRetencionPct(Number(data.items[0]?.isr_retencion_rate ?? 0) * 100);
    setIvaRetencionPct(Number(data.items[0]?.iva_retencion_rate ?? 0) * 100);
    setTaxDialogOpen(true);
  }

  async function saveTaxes() {
    if (!data) return;
    setSavingTaxes(true);
    try {
      const isrFraction = isrRetencionPct / 100;
      const ivaRetFraction = ivaRetencionPct / 100;

      let subtotal = 0;
      let ivaTotal = 0;
      let isrRetencionTotal = 0;
      let ivaRetencionTotal = 0;
      const rows = data.items.map((item) => {
        const lineSubtotal = toMoney(item.quantity * item.unit_price - item.discount);
        const ivaRate = itemIvaRates[item.id] ?? Number(item.iva_rate);
        const lineIva = toMoney(lineSubtotal * ivaRate);
        const lineIsrRetencion = toMoney(lineSubtotal * isrFraction);
        const lineIvaRetencion = toMoney(lineSubtotal * ivaRetFraction);
        subtotal = toMoney(subtotal + lineSubtotal);
        ivaTotal = toMoney(ivaTotal + lineIva);
        isrRetencionTotal = toMoney(isrRetencionTotal + lineIsrRetencion);
        ivaRetencionTotal = toMoney(ivaRetencionTotal + lineIvaRetencion);
        return {
          id: item.id,
          iva_rate: ivaRate,
          iva_amount: lineIva,
          isr_retencion_rate: isrFraction,
          isr_retencion_amount: lineIsrRetencion,
          iva_retencion_rate: ivaRetFraction,
          iva_retencion_amount: lineIvaRetencion,
        };
      });
      const retentionsTotal = toMoney(isrRetencionTotal + ivaRetencionTotal);
      const total = toMoney(subtotal + ivaTotal - retentionsTotal);

      for (const row of rows) {
        const { error } = await supabase
          .from("invoice_items")
          .update({
            iva_rate: row.iva_rate,
            iva_amount: row.iva_amount,
            isr_retencion_rate: row.isr_retencion_rate,
            isr_retencion_amount: row.isr_retencion_amount,
            iva_retencion_rate: row.iva_retencion_rate,
            iva_retencion_amount: row.iva_retencion_amount,
          })
          .eq("id", row.id);
        if (error) throw error;
      }

      const { error: invoiceError } = await supabase
        .from("invoices")
        .update({
          iva_total: ivaTotal,
          isr_retencion_total: isrRetencionTotal,
          iva_retencion_total: ivaRetencionTotal,
          retentions_total: retentionsTotal,
          total,
        })
        .eq("id", data.invoice.id);
      if (invoiceError) throw invoiceError;

      toast.success("Impuestos actualizados");
      setTaxDialogOpen(false);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos actualizar los impuestos");
    } finally {
      setSavingTaxes(false);
    }
  }

  async function confirmCancel() {
    if (!data) return;
    if (reason === "01" && !replacementUuid.trim()) {
      toast.error("El motivo 01 requiere el UUID del CFDI sustituto");
      return;
    }
    setCancelling(true);
    try {
      const { data: response, error } = await supabase.functions.invoke("facturama-cancel-cfdi", {
        body: {
          invoice_id: data.invoice.id,
          motive: reason,
          ...(reason === "01" ? { uuid_replacement: replacementUuid.trim() } : {}),
        },
      });
      if (error) {
        throw new Error(
          await getEdgeFunctionErrorMessage(error, "No fue posible cancelar el CFDI."),
        );
      }
      if (!response?.ok) {
        throw new Error(response?.reason ?? "No fue posible cancelar el CFDI.");
      }
      toast.success(
        response.cancelled
          ? "Factura cancelada ante el SAT"
          : "Solicitud de cancelación enviada; está pendiente de aceptación",
      );
      setConfirmOpen(false);
      setReplacementUuid("");
      qc.invalidateQueries({ queryKey: ["invoices", "history"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos cancelar");
    } finally {
      setCancelling(false);
    }
  }

  if (isLoading) {
    return (
      <div className="px-5 pt-[max(env(safe-area-inset-top),2.5rem)] pb-6 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-surface" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="px-5 pt-[max(env(safe-area-inset-top),2.5rem)] pb-6">
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="font-semibold">No pudimos cargar la factura</p>
          <button
            onClick={() => navigate({ to: "/history" })}
            className="mt-4 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background"
          >
            Volver a Facturas
          </button>
        </div>
      </div>
    );
  }

  const inv = data.invoice;
  const snap =
    (inv.client_snapshot as { legal_name?: string; rfc?: string; email?: string } | null) ?? {};
  const clientEmail = inv.clients?.email ?? snap.email ?? null;
  const isDraft = inv.status === "draft";
  const isIssued = inv.status === "issued";
  const isCancelled = inv.status === "cancelled";
  const cancellationPending = inv.cancellation_status === "pending";
  const stampBusy = inv.stamping_status === "processing";
  const needsReconciliation = inv.stamping_status === "reconciliation_required";

  return (
    <div className="px-5 pt-[max(env(safe-area-inset-top),2.5rem)] pb-10">
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/history" })}
          className="grid size-9 place-items-center rounded-full border border-border bg-surface"
          aria-label="Volver"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Detalle de factura
          </p>
          <h1 className="font-mono text-lg font-bold tracking-tight">{folioFmt}</h1>
        </div>
        <button
          type="button"
          onClick={duplicate}
          disabled={duplicating}
          className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-surface disabled:opacity-60"
          aria-label="Duplicar factura"
          title="Duplicar factura"
        >
          {duplicating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CopyPlus className="size-4" />
          )}
        </button>
      </header>

      <section className="mt-5 rounded-2xl border border-border bg-surface px-5 py-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Estado
        </h2>
        <div className="mt-2 flex items-center gap-2">
          <StatusChip status={inv.status} />
        </div>
        {isCancelled && inv.cancellation_reason && (
          <p className="mt-2 text-xs text-destructive">Motivo: {inv.cancellation_reason}</p>
        )}
        {cancellationPending && (
          <>
            <p className="mt-2 text-xs text-amber-700">
              Solicitud de cancelación enviada al SAT; pendiente de aceptación.
            </p>
            <button
              type="button"
              onClick={verifyCancellation}
              disabled={verifyingCancellation}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-3 py-1.5 text-[11px] font-semibold text-amber-900 disabled:opacity-60"
            >
              {verifyingCancellation ? <Loader2 className="size-3 animate-spin" /> : null} Verificar
              estado
            </button>
          </>
        )}
        {inv.uuid_fiscal && (
          <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
            <p className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase text-muted-foreground">
              {inv.uuid_fiscal}
            </p>
            <button
              onClick={copyUuid}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold"
            >
              <Copy className="size-3" /> Copiar
            </button>
          </div>
        )}
      </section>

      <section className="mt-3 rounded-2xl border border-border bg-surface px-5 py-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Receptor
        </h2>
        <p className="mt-2 font-semibold">{snap.legal_name ?? "—"}</p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{snap.rfc ?? "—"}</p>
      </section>

      <section className="mt-3 rounded-2xl border border-border bg-surface px-5 py-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Datos fiscales
        </h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Uso CFDI</dt>
            <dd className="font-medium">{inv.cfdi_use ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Moneda</dt>
            <dd className="font-medium">{inv.currency ?? "MXN"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Método de pago</dt>
            <dd className="font-medium">{inv.payment_method ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Forma de pago</dt>
            <dd className="font-medium">{inv.payment_form ?? "—"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted-foreground">Fecha de emisión</dt>
            <dd className="font-medium">
              {inv.issued_at ? formatDateMX(inv.issued_at) : formatDateMX(inv.created_at)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-3 rounded-2xl border border-border bg-surface px-5 py-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Conceptos
        </h2>
        {data.items.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Sin conceptos.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {data.items.map((it) => (
              <li key={it.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{it.description}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {Number(it.quantity)} × {formatMXN(it.unit_price)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">{formatMXN(it.amount)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatMXN(inv.subtotal)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>IVA</span>
            <span>{formatMXN(inv.iva_total)}</span>
          </div>
          {inv.isr_retencion_total > 0 && (
            <div className="flex justify-between text-destructive">
              <span>Retención ISR</span>
              <span>−{formatMXN(inv.isr_retencion_total)}</span>
            </div>
          )}
          {inv.iva_retencion_total > 0 && (
            <div className="flex justify-between text-destructive">
              <span>Retención IVA</span>
              <span>−{formatMXN(inv.iva_retencion_total)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1 text-base font-bold">
            <span>Total</span>
            <span>{formatMXN(inv.total)}</span>
          </div>
        </div>
      </section>

      {isDraft && (
        <section className="mt-5 space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Acciones
          </h2>
          <p className="text-xs text-muted-foreground">
            Esta factura se guardó como borrador pero no llegó a timbrarse. Puedes continuar el
            proceso sin volver a capturar los datos.
          </p>
          {inv.stamping_error && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {inv.stamping_error}
            </p>
          )}
          {stampBusy && (
            <p className="rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900">
              Esta factura ya está siendo timbrada. Espera un momento y actualiza.
            </p>
          )}
          {needsReconciliation && (
            <p className="rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900">
              El intento anterior no pudo confirmarse. No la reintentes hasta verificar con soporte
              que no quedó timbrada.
            </p>
          )}
          <button
            type="button"
            onClick={stampDraft}
            disabled={stamping || stampBusy || needsReconciliation}
            className={`mx-auto flex items-center justify-center gap-2 bg-foreground text-sm font-semibold text-background transition-all duration-300 active:scale-[0.98] disabled:opacity-60 ${
              stamping ? "aspect-square w-[88px] rounded-full py-0" : "w-full rounded-2xl py-3.5"
            }`}
          >
            {stamping ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                <Send className="size-4" /> Continuar con el timbrado
              </>
            )}
          </button>
          <button
            type="button"
            onClick={openTaxDialog}
            disabled={stampBusy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-3 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60"
          >
            <Pencil className="size-3.5" /> Editar impuestos
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            disabled={stamping || stampBusy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/40 bg-surface py-3 text-sm font-semibold text-destructive transition active:scale-[0.98] disabled:opacity-60"
          >
            <Trash2 className="size-3.5" /> Eliminar borrador
          </button>
        </section>
      )}

      {isIssued && (
        <section className="mt-5 space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Acciones
          </h2>
          <div className="flex flex-nowrap gap-1.5">
            {inv.xml_url && (
              <button
                type="button"
                onClick={() =>
                  openInvoiceDocument(inv.xml_url!).catch((error) => toast.error(error.message))
                }
                className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full border border-border bg-surface px-2 py-1.5 text-xs font-semibold"
              >
                <Download className="size-3.5 shrink-0" /> <span className="truncate">XML</span>
              </button>
            )}
            {inv.pdf_url && (
              <button
                type="button"
                onClick={() =>
                  openInvoiceDocument(inv.pdf_url!).catch((error) => toast.error(error.message))
                }
                className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full border border-border bg-surface px-2 py-1.5 text-xs font-semibold"
              >
                <Download className="size-3.5 shrink-0" /> <span className="truncate">PDF</span>
              </button>
            )}
            {inv.pdf_url && (
              <button
                type="button"
                onClick={sendWhatsApp}
                disabled={sendingWhatsApp}
                className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full bg-[#25D366] px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {sendingWhatsApp ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin" />
                ) : (
                  <Share2 className="size-3.5 shrink-0" />
                )}
                <span className="truncate">WhatsApp</span>
              </button>
            )}
            {inv.pdf_url && (
              <button
                type="button"
                onClick={sendInvoiceEmail}
                disabled={sendingEmail || !clientEmail}
                title={clientEmail ? undefined : "Este cliente no tiene un correo capturado."}
                className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full border border-border bg-surface px-2 py-1.5 text-xs font-semibold disabled:opacity-60"
              >
                {sendingEmail ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin" />
                ) : (
                  <Mail className="size-3.5 shrink-0" />
                )}
                <span className="truncate">{inv.email_sent_at ? "Reenviar" : "Correo"}</span>
              </button>
            )}
            <button
              onClick={() => setConfirmOpen(true)}
              className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full bg-destructive px-2 py-1.5 text-xs font-semibold text-destructive-foreground"
            >
              <Ban className="size-3.5 shrink-0" />{" "}
              <span className="truncate">Cancelar factura</span>
            </button>
          </div>
          {!clientEmail && (
            <p className="text-[11px] text-muted-foreground">
              Agrega un correo al cliente para poder enviarle la factura por email.
            </p>
          )}
          {inv.email_sent_at && (
            <p className="text-[11px] text-muted-foreground">
              Correo enviado el {formatDateMX(inv.email_sent_at)}
              {inv.email_last_error ? " — el último reenvío falló, intenta de nuevo." : ""}
            </p>
          )}
          {!inv.email_sent_at && inv.email_last_error && (
            <p className="text-[11px] text-destructive">
              No pudimos enviar la copia por correo automáticamente: {inv.email_last_error}
            </p>
          )}
        </section>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar esta factura?</AlertDialogTitle>
            <AlertDialogDescription className="hidden">
              Esta acción no se puede deshacer. La factura quedará marcada como cancelada. En
              producción se enviará la solicitud al SAT.
            </AlertDialogDescription>
            <p className="text-sm text-muted-foreground">
              La solicitud se enviará al SAT. La factura sólo se marcará como cancelada si se
              confirma la cancelación.
            </p>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">
              Motivo de cancelación
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring"
            >
              {CANCEL_REASONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
            {reason === "01" && (
              <div className="space-y-2 pt-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  UUID del CFDI sustituto
                </label>
                <input
                  value={replacementUuid}
                  onChange={(event) => setReplacementUuid(event.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring"
                />
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Mantener factura</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmCancel();
              }}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? <Loader2 className="size-4 animate-spin" /> : "Sí, cancelar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este borrador?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la factura {folioFmt} y sus conceptos. Esta acción no se puede deshacer.
              Solo puedes eliminar borradores que no han sido timbrados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Conservar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteDraft();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : "Sí, eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={taxDialogOpen} onOpenChange={setTaxDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar impuestos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                IVA por concepto
              </p>
              {data.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate text-sm">{item.description}</p>
                  <select
                    value={itemIvaRates[item.id] ?? Number(item.iva_rate)}
                    onChange={(e) =>
                      setItemIvaRates((rates) => ({
                        ...rates,
                        [item.id]: Number(e.target.value),
                      }))
                    }
                    className="w-24 shrink-0 rounded-xl border border-input bg-background px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring"
                  >
                    {IVA_RATE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t border-border pt-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Retención de ISR
              </label>
              <select
                value={isrRetencionPct}
                onChange={(e) => setIsrRetencionPct(Number(e.target.value))}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring"
              >
                {ISR_RETENCION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Retención de IVA
              </label>
              <select
                value={ivaRetencionPct}
                onChange={(e) => setIvaRetencionPct(Number(e.target.value))}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring"
              >
                {IVA_RETENCION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Estas tasas se validan de nuevo en servidor al timbrar; si no corresponden al régimen
              del emisor y al tipo de cliente, el timbrado se rechazará.
            </p>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setTaxDialogOpen(false)}
              disabled={savingTaxes}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveTaxes}
              disabled={savingTaxes}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-60"
            >
              {savingTaxes ? <Loader2 className="size-4 animate-spin" /> : "Guardar cambios"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TimbradoSuccessOverlay
        open={stampSuccessOpen}
        onClose={() => setStampSuccessOpen(false)}
        folioFiscal={stampedUuid}
      />
    </div>
  );
}
