import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Download, FileBarChart, Percent, ReceiptText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatMXN } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { StatusChip } from "./dashboard";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

interface ReportInvoice {
  series: string;
  folio: number;
  issued_at: string | null;
  created_at: string;
  status: string;
  uuid_fiscal: string | null;
  client_snapshot: { legal_name?: string; rfc?: string } | null;
  subtotal: number;
  iva_total: number;
  isr_retencion_total: number;
  iva_retencion_total: number;
  retentions_total: number;
  total: number;
  cancelled_at: string | null;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthValueOf(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

// Mismo patrón de rango [startOfMonth, startOfNextMonth) que ya usa
// dashboard.tsx para el mes en curso, aplicado aquí al mes que el usuario
// elija en el selector.
function monthRange(monthValue: string) {
  const [yearStr, monthStr] = monthValue.split("-");
  const year = Number(yearStr);
  const month0 = Number(monthStr) - 1;
  return {
    start: new Date(year, month0, 1),
    end: new Date(year, month0 + 1, 1),
  };
}

async function loadReportInvoices(monthValue: string): Promise<ReportInvoice[]> {
  const { start, end } = monthRange(monthValue);
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "series, folio, issued_at, created_at, status, uuid_fiscal, client_snapshot, subtotal, iva_total, isr_retencion_total, iva_retencion_total, retentions_total, total, cancelled_at",
    )
    .in("status", ["issued", "cancelled"])
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReportInvoice[];
}

function folioLabel(inv: Pick<ReportInvoice, "series" | "folio">) {
  return `${inv.series}-${String(inv.folio).padStart(6, "0")}`;
}

function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toISODateOnly(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function buildCsv(rows: ReportInvoice[]): string {
  const header = [
    "Folio",
    "Fecha",
    "Cliente",
    "RFC",
    "Estado",
    "Subtotal",
    "IVA",
    "Retencion ISR",
    "Retencion IVA",
    "Total",
    "UUID Fiscal",
  ];
  const lines = rows.map((inv) => {
    const snap = inv.client_snapshot ?? {};
    return [
      folioLabel(inv),
      toISODateOnly(inv.issued_at ?? inv.created_at),
      snap.legal_name ?? "",
      snap.rfc ?? "",
      inv.status === "cancelled" ? "Cancelada" : "Vigente",
      Number(inv.subtotal).toFixed(2),
      Number(inv.iva_total).toFixed(2),
      Number(inv.isr_retencion_total).toFixed(2),
      Number(inv.iva_retencion_total).toFixed(2),
      Number(inv.total).toFixed(2),
      inv.uuid_fiscal ?? "",
    ]
      .map(csvField)
      .join(",");
  });
  return "﻿" + [header.join(","), ...lines].join("\n");
}

function downloadCsv(monthValue: string, rows: ReportInvoice[]) {
  const csv = buildCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `factio-reporte-${monthValue}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const [monthValue, setMonthValue] = useState(() => monthValueOf(new Date()));

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "invoices", monthValue],
    queryFn: () => loadReportInvoices(monthValue),
  });

  const rows = data ?? [];

  const summary = useMemo(() => {
    const invoices = data ?? [];
    const issued = invoices.filter((r) => r.status === "issued");
    const cancelledCount = invoices.length - issued.length;
    return {
      subtotal: issued.reduce((a, r) => a + Number(r.subtotal ?? 0), 0),
      iva: issued.reduce((a, r) => a + Number(r.iva_total ?? 0), 0),
      isrRetencion: issued.reduce((a, r) => a + Number(r.isr_retencion_total ?? 0), 0),
      ivaRetencion: issued.reduce((a, r) => a + Number(r.iva_retencion_total ?? 0), 0),
      issuedCount: issued.length,
      cancelledCount,
    };
  }, [data]);

  return (
    <div className="px-5 pt-[max(env(safe-area-inset-top),2.5rem)] pb-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/profile"
            className="grid size-10 place-items-center rounded-full border border-border bg-surface"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <h1 className="text-xl font-bold tracking-tight">Reportes</h1>
        </div>
        <button
          type="button"
          disabled={rows.length === 0}
          onClick={() => downloadCsv(monthValue, rows)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-semibold text-muted-foreground disabled:opacity-50"
        >
          <Download className="size-3.5" /> Exportar CSV
        </button>
      </header>

      <div className="mt-5">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Periodo
        </label>
        <input
          type="month"
          value={monthValue}
          max={monthValueOf(new Date())}
          onChange={(e) => setMonthValue(e.target.value)}
          className="mt-1.5 w-full rounded-2xl border border-input bg-surface px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring"
        />
      </div>

      {isLoading ? (
        <div className="mt-5 space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl border border-border bg-surface"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon={FileBarChart}
            title="Sin facturas este mes"
            description="No hay facturas emitidas ni canceladas en el periodo seleccionado."
          />
        </div>
      ) : (
        <>
          <section className="mt-5 grid grid-cols-2 gap-3">
            <div className="col-span-2 rounded-2xl border border-border bg-surface p-4 shadow-soft">
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                  <ReceiptText className="size-3.5" strokeWidth={2} />
                </span>
                Total facturado (sin IVA)
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight">
                {formatMXN(summary.subtotal)}
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {summary.issuedCount} emitida{summary.issuedCount === 1 ? "" : "s"} ·{" "}
                {summary.cancelledCount} cancelada{summary.cancelledCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                  <Percent className="size-3.5" strokeWidth={2} />
                </span>
                IVA trasladado
              </div>
              <p className="mt-2 text-xl font-bold tracking-tight">{formatMXN(summary.iva)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                  <Percent className="size-3.5" strokeWidth={2} />
                </span>
                Retenciones
              </div>
              <p className="mt-2 text-sm font-semibold">ISR {formatMXN(summary.isrRetencion)}</p>
              <p className="text-sm font-semibold">IVA {formatMXN(summary.ivaRetencion)}</p>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="mb-3 text-lg font-bold">Detalle del periodo</h2>
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 font-semibold">Folio</th>
                    <th className="px-3 py-2.5 font-semibold">Cliente</th>
                    <th className="px-3 py-2.5 font-semibold">Emisión</th>
                    <th className="px-3 py-2.5 font-semibold">Estado</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Subtotal</th>
                    <th className="px-3 py-2.5 text-right font-semibold">IVA</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Retenciones</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                    <th className="px-3 py-2.5 font-semibold">UUID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((inv, i) => {
                    const cancelled = inv.status === "cancelled";
                    const snap = inv.client_snapshot ?? {};
                    return (
                      <tr key={i} className={cancelled ? "opacity-60" : ""}>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono">
                          {folioLabel(inv)}
                        </td>
                        <td className="max-w-[160px] truncate px-3 py-2.5">
                          {snap.legal_name ?? "Cliente"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {toISODateOnly(inv.issued_at ?? inv.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <StatusChip status={inv.status} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          {formatMXN(inv.subtotal)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          {formatMXN(inv.iva_total)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          {formatMXN(inv.retentions_total)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">
                          {formatMXN(inv.total)}
                        </td>
                        <td className="max-w-[140px] truncate px-3 py-2.5 font-mono text-[10px] text-muted-foreground">
                          {inv.uuid_fiscal ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
