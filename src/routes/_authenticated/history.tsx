import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Search,
  FileText,
  ChevronRight,
  Plus,
  AlertTriangle,
  Clock,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionErrorMessage } from "@/lib/edge-function-errors";
import { formatMXN, formatDateMX } from "@/lib/format";
import { StatusChip } from "./dashboard";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/_authenticated/history")({
  component: History,
});

async function loadInvoices() {
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id, series, folio, total, status, created_at, uuid_fiscal, client_snapshot, xml_url, pdf_url, stamping_status, stamping_error, cancellation_status, cancellation_requested_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

// Mismo cálculo que _shared/cancellation-check.ts (businessHoursElapsed) —
// aquí solo es una vista previa client-side para decidir qué texto mostrar
// antes de que el usuario pulse "Verificar estado"; la respuesta del
// servidor (contra Facturama) sigue siendo la única fuente de verdad.
const HOUR_MS = 3_600_000;
const CANCELLATION_ACCEPTANCE_DEADLINE_HOURS = 72;
function businessHoursElapsed(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;
  let hours = 0;
  let cursor = from.getTime();
  const end = to.getTime();
  while (cursor < end) {
    const next = Math.min(end, cursor + HOUR_MS);
    const day = new Date(cursor).getUTCDay();
    if (day !== 0 && day !== 6) hours += (next - cursor) / HOUR_MS;
    cursor = next;
  }
  return hours;
}

type StatusFilter = "all" | "issued" | "cancelled";

function History() {
  const { data, isLoading } = useQuery({
    queryKey: ["invoices", "history"],
    queryFn: loadInvoices,
  });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: isAdmin } = useQuery({
    queryKey: ["auth", "isAdmin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("current_user_is_admin");
      return error ? false : (data ?? false);
    },
  });

  const pending = (data ?? []).filter((i) => i.stamping_status === "reconciliation_required");
  const cancellationPending = (data ?? []).filter((i) => i.cancellation_status === "pending");

  const filtered = (data ?? [])
    .filter((i) => i.stamping_status !== "reconciliation_required")
    .filter((i) => i.cancellation_status !== "pending")
    .filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (!q) return true;
      const t = q.toLowerCase();
      const snap = (i.client_snapshot as { legal_name?: string; rfc?: string } | null) ?? {};
      return (
        (snap.legal_name ?? "").toLowerCase().includes(t) ||
        (snap.rfc ?? "").toLowerCase().includes(t) ||
        `${i.series}-${i.folio}`.toLowerCase().includes(t) ||
        (i.uuid_fiscal ?? "").toLowerCase().includes(t)
      );
    });

  function refreshAfterReconciliation() {
    qc.invalidateQueries({ queryKey: ["invoices", "history"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  function refreshAfterCancellationCheck() {
    qc.invalidateQueries({ queryKey: ["invoices", "history"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  return (
    <div className="px-5 pt-[max(env(safe-area-inset-top),2.5rem)] pb-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Facturas
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Facturas</h1>
        </div>
        <Link
          to="/invoices/new"
          className="grid size-11 place-items-center rounded-full bg-foreground text-background shadow-lift transition active:scale-95"
          aria-label="Nueva factura"
        >
          <Plus className="size-5" strokeWidth={2.4} />
        </Link>
      </header>

      {pending.length > 0 && (
        <section className="mt-5 space-y-2">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-800">
            <AlertTriangle className="size-3.5" /> Requieren conciliación ({pending.length})
          </h2>
          {pending.map((invoice) => (
            <ReconciliationCard
              key={invoice.id}
              invoice={invoice}
              onResolved={refreshAfterReconciliation}
              isAdmin={!!isAdmin}
            />
          ))}
        </section>
      )}

      {cancellationPending.length > 0 && (
        <section className="mt-5 space-y-2">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-800">
            <Clock className="size-3.5" /> Cancelaciones pendientes de aceptación (
            {cancellationPending.length})
          </h2>
          {cancellationPending.map((invoice) => (
            <CancellationPendingCard
              key={invoice.id}
              invoice={invoice as unknown as PendingCancellationInvoice}
              onResolved={refreshAfterCancellationCheck}
            />
          ))}
        </section>
      )}

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cliente, RFC, folio o UUID…"
          className="w-full rounded-2xl border border-input bg-surface py-3 pl-11 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring"
        />
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {(
          [
            ["all", "Todas"],
            ["issued", "Vigentes"],
            ["cancelled", "Canceladas"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStatus(key)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              status === key
                ? "bg-foreground text-background"
                : "border border-border bg-surface text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-2xl border border-border bg-surface"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Sin facturas"
            description="Cuando emitas facturas aparecerán aquí."
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((inv) => {
              const snap =
                (inv.client_snapshot as { legal_name?: string; rfc?: string } | null) ?? {};
              return (
                <li key={inv.id} className="rounded-2xl border border-border bg-surface p-4">
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/invoices/$id", params: { id: inv.id } })}
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{snap.legal_name ?? "Cliente"}</p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                        {inv.status === "draft"
                          ? "Borrador"
                          : `${inv.series}-${String(inv.folio).padStart(6, "0")}`}{" "}
                        · {formatDateMX(inv.created_at)}
                        {snap.rfc ? ` · ${snap.rfc}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatMXN(inv.total)}</p>
                      <StatusChip status={inv.status} />
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

    </div>
  );
}

interface PendingInvoice {
  id: string;
  series: string;
  folio: number;
  total: number;
  stamping_error: string | null;
}

function ReconciliationCard({
  invoice,
  onResolved,
  isAdmin,
}: {
  invoice: PendingInvoice;
  onResolved: () => void;
  isAdmin: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualId, setManualId] = useState("");
  const folioFmt = `${invoice.series}-${String(invoice.folio).padStart(6, "0")}`;

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("facturama-reconcile-cfdi", {
        body: { invoice_id: invoice.id, ...body },
      });
      if (error) {
        throw new Error(
          await getEdgeFunctionErrorMessage(error, "No fue posible resolver la factura."),
        );
      }
      if (!data?.ok) throw new Error(data?.reason ?? "No fue posible resolver la factura.");
      toast.success(
        data.resolved
          ? "Factura conciliada: se recuperó el CFDI."
          : "Factura liberada para reintentar.",
      );
      onResolved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos resolver la factura");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold uppercase tracking-tight">{folioFmt}</p>
          <p className="mt-0.5 text-sm font-semibold">{formatMXN(invoice.total)}</p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-amber-900/80">
        {invoice.stamping_error ?? "No se pudo confirmar el resultado del timbrado."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => call({ action: "auto" })}
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-900 px-3 py-1.5 text-[11px] font-semibold text-amber-50 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : null} Reintentar automáticamente
        </button>
        {isAdmin && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowManual((v) => !v)}
            className="rounded-full border border-amber-300 bg-background px-3 py-1.5 text-[11px] font-semibold text-amber-900"
          >
            Resolver manualmente
          </button>
        )}
      </div>
      {!isAdmin && (
        <p className="mt-2 text-[11px] text-amber-900/60">
          Si el problema continúa después de reintentar, contáctanos.
        </p>
      )}
      {isAdmin && showManual && (
        <div className="mt-3 space-y-2 border-t border-amber-200 pt-3">
          <p className="text-[11px] text-amber-900/80">
            Verifica en el panel de Facturama si esta factura sí se timbró.
          </p>
          <div className="flex gap-2">
            <input
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="ID del CFDI en Facturama"
              className="min-w-0 flex-1 rounded-xl border border-amber-300 bg-background px-3 py-2 text-xs"
            />
            <button
              type="button"
              disabled={busy || !manualId.trim()}
              onClick={() =>
                call({ action: "confirm_stamped", facturama_cfdi_id: manualId.trim() })
              }
              className="shrink-0 rounded-xl bg-amber-900 px-3 py-2 text-[11px] font-semibold text-amber-50 disabled:opacity-60"
            >
              Sí se timbró
            </button>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => call({ action: "confirm_not_stamped" })}
            className="w-full rounded-xl border border-amber-300 bg-background py-2 text-[11px] font-semibold text-amber-900 disabled:opacity-60"
          >
            Confirmar que no se timbró (liberar timbre)
          </button>
        </div>
      )}
    </div>
  );
}

interface PendingCancellationInvoice {
  id: string;
  series: string;
  folio: number;
  total: number;
  client_snapshot: { legal_name?: string; rfc?: string } | null;
  cancellation_requested_at: string | null;
}

function CancellationPendingCard({
  invoice,
  onResolved,
}: {
  invoice: PendingCancellationInvoice;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const folioFmt = `${invoice.series}-${String(invoice.folio).padStart(6, "0")}`;
  const snap = invoice.client_snapshot ?? {};
  const requestedAt = invoice.cancellation_requested_at
    ? new Date(invoice.cancellation_requested_at)
    : null;
  const hoursElapsed = requestedAt ? businessHoursElapsed(requestedAt, new Date()) : 0;
  const overdue = hoursElapsed >= CANCELLATION_ACCEPTANCE_DEADLINE_HOURS;

  async function verify() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("facturama-check-cancellation", {
        body: { invoice_id: invoice.id },
      });
      if (error) {
        throw new Error(
          await getEdgeFunctionErrorMessage(error, "No fue posible verificar el estado."),
        );
      }
      if (!data?.ok) throw new Error(data?.reason ?? "No fue posible verificar el estado.");
      if (data.resolved && data.cancelled) {
        toast.success("El receptor aceptó la cancelación: factura cancelada.");
        onResolved();
      } else if (data.overdue) {
        toast.info("El plazo esperado ya venció; revisa el Buzón Tributario del SAT.");
      } else {
        toast.info("El receptor aún no responde. Sigue pendiente.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos verificar el estado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold uppercase tracking-tight">{folioFmt}</p>
          <p className="mt-0.5 truncate text-sm font-semibold">{snap.legal_name ?? "Cliente"}</p>
        </div>
        <p className="shrink-0 text-sm font-bold">{formatMXN(invoice.total)}</p>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-amber-900/80">
        {requestedAt
          ? `Cancelación solicitada el ${formatDateMX(invoice.cancellation_requested_at!)}, pendiente de aceptación del receptor.`
          : "Pendiente de aceptación del receptor."}
      </p>
      {overdue && (
        <p className="mt-1 text-xs font-semibold text-amber-900">
          Ya venció el plazo esperado de 72 horas hábiles. Confirma el estado directamente en el
          Buzón Tributario del SAT — no se puede dar por cancelada solo por el paso del tiempo.
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={verify}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-900 px-3 py-1.5 text-[11px] font-semibold text-amber-50 disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : null} Verificar estado
      </button>
    </div>
  );
}
