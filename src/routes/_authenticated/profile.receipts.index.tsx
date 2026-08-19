import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ReceiptText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadCompanyProfile } from "@/features/profile/company-profile";
import { formatMXN, formatDateLong } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/_authenticated/profile/receipts/")({
  component: ReceiptsHistory,
});

interface ReceiptListRow {
  id: string;
  kind: string;
  plan_name: string;
  amount_cents: number;
  currency: string;
  created_at: string;
}

async function loadReceipts(): Promise<ReceiptListRow[]> {
  const { company } = await loadCompanyProfile();
  if (!company) return [];
  const { data, error } = await supabase
    .from("billing_receipts")
    .select("id, kind, plan_name, amount_cents, currency, created_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

function ReceiptsHistory() {
  const { data, isLoading } = useQuery({ queryKey: ["billing-receipts"], queryFn: loadReceipts });
  const receipts = data ?? [];

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
            Suscripción
          </p>
          <h1 className="text-xl font-bold tracking-tight">Historial de cobros</h1>
        </div>
      </header>

      <div className="mt-6">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-2xl border border-border bg-surface"
              />
            ))}
          </div>
        ) : receipts.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="Sin cobros todavía"
            description="Aquí verás el historial de cobros de tu suscripción."
          />
        ) : (
          <ul className="space-y-2">
            {receipts.map((receipt) => (
              <li key={receipt.id}>
                <Link
                  to="/profile/receipts/$id"
                  params={{ id: receipt.id }}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 transition active:scale-[0.99]"
                >
                  <div className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
                    <ReceiptText className="size-4" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">
                      {receipt.kind === "activation" ? "Activación" : "Renovación"} ·{" "}
                      {receipt.plan_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateLong(receipt.created_at)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">
                    {formatMXN(receipt.amount_cents / 100)} {receipt.currency.toUpperCase()}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
