import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, ReceiptText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatMXN, formatDateLong } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/profile/receipts/$id")({
  component: ReceiptDetail,
});

type ReceiptRow = {
  id: string;
  kind: string;
  plan_name: string;
  cfdi_limit: number;
  amount_cents: number;
  currency: string;
  period_start: string;
  period_end: string;
  created_at: string;
};

async function loadReceipt(id: string): Promise<ReceiptRow> {
  const { data, error } = await supabase
    .from("billing_receipts")
    .select(
      "id, kind, plan_name, cfdi_limit, amount_cents, currency, period_start, period_end, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No encontramos este recibo");
  return data;
}

function ReceiptDetail() {
  const { id } = Route.useParams();
  const {
    data: receipt,
    isLoading,
    error,
  } = useQuery({ queryKey: ["billing-receipt", id], queryFn: () => loadReceipt(id) });

  return (
    <div className="px-5 pt-[max(env(safe-area-inset-top),2.5rem)] pb-6">
      <header className="flex items-center gap-3">
        <Link
          to="/profile"
          className="grid size-10 place-items-center rounded-full border border-border bg-surface"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Perfil
          </p>
          <h1 className="text-xl font-bold tracking-tight">Recibo</h1>
        </div>
      </header>

      {isLoading ? (
        <div className="grid min-h-[50vh] place-items-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : error || !receipt ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "No encontramos este recibo"}
        </p>
      ) : (
        <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
              <ReceiptText className="size-4" />
            </div>
            <div>
              <p className="font-semibold">
                {receipt.kind === "activation"
                  ? "Activación de suscripción"
                  : "Renovación de suscripción"}
              </p>
              <p className="text-xs text-muted-foreground">{formatDateLong(receipt.created_at)}</p>
            </div>
          </div>

          <div className="mt-5 space-y-3 border-t border-border pt-4">
            <Row label="Plan" value={receipt.plan_name} />
            <Row label="CFDIs incluidos" value={`${receipt.cfdi_limit} CFDIs`} />
            <Row
              label="Monto"
              value={`${formatMXN(receipt.amount_cents / 100)} ${receipt.currency.toUpperCase()}`}
            />
            <Row
              label="Periodo"
              value={`${formatDateLong(receipt.period_start)} – ${formatDateLong(receipt.period_end)}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
