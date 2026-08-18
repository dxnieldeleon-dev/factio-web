import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Plus,
  Bell,
  TrendingUp,
  TrendingDown,
  Users as UsersIcon,
  Percent,
  LogOut,
  ChevronRight,
  ShieldAlert,
  X,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import { formatMXN, formatDateMX } from "@/lib/format";
import { clientCategoryIcon } from "@/lib/client-categories";
import { signOutFactio } from "@/lib/sign-out";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

interface DashboardData {
  monthIncome: number;
  monthIva: number;
  clientsCount: number;
  recent: Array<{
    id: string;
    series: string;
    folio: number;
    total: number;
    status: string;
    created_at: string;
    client_snapshot: { legal_name?: string; business_category?: string | null } | null;
  }>;
  businessName: string;
  csdReady: boolean;
  hasActiveSubscription: boolean;
  stampBalance: number | null;
  facturasIncluidas: number | null;
  incomeChangePct: number | null;
  newClientsThisMonth: number;
  incomeSparkline: number[];
}

async function loadDashboard(): Promise<DashboardData> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  const email = userData.user?.email ?? "";

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const startOfSparkline = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const companyRes = await supabase
    .from("companies")
    .select("id, trade_name, legal_name, csd_cer_url, csd_key_url, csd_serial_number, csd_valid_to")
    .eq("user_id", userId!)
    .limit(1)
    .maybeSingle();

  const companyId = companyRes.data?.id;

  const [
    monthRes,
    clientsRes,
    recentRes,
    walletRes,
    subRes,
    prevMonthRes,
    sparklineRes,
    newClientsRes,
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("subtotal, iva_total")
      .eq("status", "issued")
      .gte("created_at", startOfMonth.toISOString()),
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase
      .from("invoices")
      .select("id, series, folio, total, status, created_at, client_snapshot")
      .neq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(5),
    companyId
      ? supabase.from("stamp_wallets").select("balance").eq("company_id", companyId).maybeSingle()
      : Promise.resolve({ data: null }),
    companyId
      ? supabase
          .from("subscriptions")
          .select("status, plan:plans(facturas_incluidas)")
          .eq("company_id", companyId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("invoices")
      .select("subtotal")
      .eq("status", "issued")
      .gte("created_at", startOfPrevMonth.toISOString())
      .lt("created_at", startOfMonth.toISOString()),
    supabase
      .from("invoices")
      .select("subtotal, created_at")
      .eq("status", "issued")
      .gte("created_at", startOfSparkline.toISOString()),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfMonth.toISOString()),
  ]);

  const monthIncome = (monthRes.data ?? []).reduce((a, r) => a + Number(r.subtotal ?? 0), 0);
  const monthIva = (monthRes.data ?? []).reduce((a, r) => a + Number(r.iva_total ?? 0), 0);

  const prevMonthIncome = (prevMonthRes.data ?? []).reduce(
    (a, r) => a + Number(r.subtotal ?? 0),
    0,
  );
  const incomeChangePct =
    prevMonthIncome > 0 ? ((monthIncome - prevMonthIncome) / prevMonthIncome) * 100 : null;

  const sparklineBuckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return d.getFullYear() * 12 + d.getMonth();
  });
  const incomeSparkline = sparklineBuckets.map((key) =>
    (sparklineRes.data ?? [])
      .filter((r) => {
        const d = new Date(r.created_at as string);
        return d.getFullYear() * 12 + d.getMonth() === key;
      })
      .reduce((a, r) => a + Number(r.subtotal ?? 0), 0),
  );

  const c = companyRes.data;
  const csdReady = !!(
    c?.csd_cer_url &&
    c?.csd_key_url &&
    c?.csd_serial_number &&
    c?.csd_valid_to &&
    new Date(c.csd_valid_to) > new Date()
  );

  const subStatus = (subRes.data as { status?: string } | null)?.status;
  const hasActiveSubscription = subStatus === "active" || subStatus === "trialing";
  const planData = (subRes.data as { plan?: { facturas_incluidas?: number } | null } | null)?.plan;

  return {
    monthIncome,
    monthIva,
    clientsCount: clientsRes.count ?? 0,
    recent: (recentRes.data as DashboardData["recent"]) ?? [],
    businessName: c?.trade_name || c?.legal_name || email.split("@")[0] || "Mi negocio",
    csdReady,
    hasActiveSubscription,
    stampBalance: (walletRes.data as { balance?: number } | null)?.balance ?? null,
    incomeChangePct,
    newClientsThisMonth: newClientsRes.count ?? 0,
    incomeSparkline,
    facturasIncluidas: planData?.facturas_incluidas ?? null,
  };
}

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: loadDashboard });
  const { data: hasUnreadNotifications } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
  const [csdDismissed, setCsdDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("ff.csdBannerDismissed") === "1";
  });
  function dismissCsd() {
    setCsdDismissed(true);
    try {
      window.localStorage.setItem("ff.csdBannerDismissed", "1");
    } catch {
      // Dismissing the local-only banner must not block dashboard usage.
    }
  }

  // Sin suscripción activa: no hay timbres que gastar.
  // Con suscripción activa pero saldo en 0 (o negativo): se acabó el cupo del mes.
  const limitReached =
    !!data &&
    data.csdReady &&
    (!data.hasActiveSubscription || (data.stampBalance !== null && data.stampBalance <= 0));

  async function onSignOut() {
    await signOutFactio(queryClient);
    navigate({ to: "/auth", replace: true });
  }

  const initials = (data?.businessName ?? "FF").slice(0, 2).toUpperCase();

  return (
    <div className="px-5 pt-[max(env(safe-area-inset-top),2.5rem)] pb-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-full bg-primary-soft text-sm font-bold uppercase text-primary">
            {initials}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Factio
            </p>
            <h1 className="text-base font-semibold leading-tight">{data?.businessName ?? "..."}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate({ to: "/notifications" })}
            className="relative grid size-10 place-items-center rounded-full border border-border bg-surface transition active:scale-95"
            aria-label="Notificaciones"
          >
            <Bell className="size-[18px]" strokeWidth={1.8} />
            {hasUnreadNotifications && (
              <span className="absolute right-2 top-2 size-2 rounded-full bg-destructive ring-2 ring-surface" />
            )}
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="grid size-10 place-items-center rounded-full border border-border bg-surface transition active:scale-95"
            aria-label="Cerrar sesión"
          >
            <LogOut className="size-[18px]" strokeWidth={1.8} />
          </button>
        </div>
      </header>

      {data && !data.csdReady && !csdDismissed && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-amber-900 shadow-soft animate-reveal">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" strokeWidth={1.8} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Completa la configuración de tu CSD</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-900/80">
              Necesitas cargar tu Certificado de Sello Digital para poder timbrar facturas ante el
              SAT.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/onboarding" })}
              className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-900 px-3 py-1 text-[11px] font-semibold text-amber-50 transition hover:bg-amber-950"
            >
              Configurar CSD ahora
            </button>
          </div>
          <button
            type="button"
            onClick={dismissCsd}
            aria-label="Descartar aviso"
            className="grid size-7 shrink-0 place-items-center rounded-full text-amber-900/70 transition hover:bg-amber-900/10"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {limitReached && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-amber-900 shadow-soft animate-reveal">
          <Zap className="mt-0.5 size-5 shrink-0" strokeWidth={1.8} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {data?.hasActiveSubscription
                ? "Llegaste a tu límite de facturas este mes"
                : "Necesitas una suscripción para timbrar"}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-900/80">
              {data?.hasActiveSubscription
                ? "Sube de plan para seguir timbrando facturas este mes."
                : "Elige un plan para empezar a timbrar tus facturas ante el SAT."}
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/profile" })}
              className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-900 px-3 py-1 text-[11px] font-semibold text-amber-50 transition hover:bg-amber-950"
            >
              {data?.hasActiveSubscription ? "Ver planes" : "Elegir un plan"}
            </button>
          </div>
        </div>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 animate-reveal">
        <div className="col-span-2 flex items-center justify-between gap-4 rounded-3xl border border-border bg-surface p-5 shadow-soft">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Ingresos del mes</p>
            <p className="mt-1 truncate text-3xl font-extrabold tracking-tight">
              {isLoading ? "—" : formatMXN(data?.monthIncome ?? 0)}
              <span className="ml-2 align-middle text-sm font-medium text-muted-foreground">
                MXN
              </span>
            </p>
            {data && data.incomeChangePct !== null ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    data.incomeChangePct >= 0
                      ? "bg-success/10 text-success"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {data.incomeChangePct >= 0 ? (
                    <TrendingUp className="size-3" />
                  ) : (
                    <TrendingDown className="size-3" />
                  )}
                  {data.incomeChangePct >= 0 ? "+" : ""}
                  {data.incomeChangePct.toFixed(1)}%
                </span>
                <span>vs. mes anterior · Sin IVA</span>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingUp className="size-3.5" />
                <span>Sin IVA · calculado en tiempo real</span>
              </div>
            )}
          </div>
          {data && (
            <div className="flex h-16 shrink-0 items-end gap-1">
              {(() => {
                const max = Math.max(...data.incomeSparkline, 1);
                return data.incomeSparkline.map((v, i) => (
                  <div
                    key={i}
                    className="w-2 rounded-full bg-primary-soft"
                    style={{
                      height: `${Math.max((v / max) * 100, 8)}%`,
                      opacity: 0.45 + (i / (data.incomeSparkline.length - 1)) * 0.55,
                    }}
                  />
                ));
              })()}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
              <Percent className="size-3.5" strokeWidth={2} />
            </span>
            IVA del mes
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight">
            {isLoading ? "—" : formatMXN(data?.monthIva ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
              <UsersIcon className="size-3.5" strokeWidth={2} />
            </span>
            Clientes
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-2xl font-bold tracking-tight">
              {isLoading ? "—" : data?.clientsCount}
            </p>
            {data && data.newClientsThisMonth > 0 && (
              <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-bold text-success">
                +{data.newClientsThisMonth} nuevos
              </span>
            )}
          </div>
        </div>
      </section>

      {limitReached ? (
        <button
          type="button"
          onClick={() => navigate({ to: "/profile" })}
          className="mt-6 flex w-full animate-reveal items-center justify-center gap-2 rounded-2xl bg-muted py-4 text-sm font-semibold text-muted-foreground shadow-soft transition active:scale-[0.98]"
          style={{ animationDelay: "100ms" }}
        >
          <Plus className="size-5" strokeWidth={2.4} />
          Nueva factura (sin timbres disponibles)
        </button>
      ) : (
        <Link
          to="/invoices/new"
          className="mt-6 flex w-full animate-reveal items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-sm font-semibold text-primary-foreground shadow-lift transition active:scale-[0.98]"
          style={{ animationDelay: "100ms" }}
        >
          <Plus className="size-5" strokeWidth={2.4} />
          Nueva factura
        </Link>
      )}

      <section className="mt-10 animate-reveal" style={{ animationDelay: "200ms" }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Facturas recientes</h2>
          <Link to="/history" className="text-sm font-semibold text-primary">
            Ver todas
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-2xl border border-border bg-surface"
              />
            ))}
          </div>
        ) : data && data.recent.length > 0 ? (
          <ul className="divide-y divide-border rounded-3xl border border-border bg-surface">
            {data.recent.map((inv) => {
              const CategoryIcon = clientCategoryIcon(inv.client_snapshot?.business_category);
              return (
                <li key={inv.id}>
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/invoices/$id", params: { id: inv.id } })}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Ver factura ${inv.series}-${String(inv.folio).padStart(6, "0")}`}
                  >
                    <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                      <CategoryIcon className="size-[18px]" strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {inv.client_snapshot?.legal_name ?? "Cliente"}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-tight text-muted-foreground">
                        {inv.series}-{String(inv.folio).padStart(6, "0")} ·{" "}
                        {formatDateMX(inv.created_at)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-bold">{formatMXN(inv.total)}</p>
                      <StatusChip status={inv.status} />
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-3xl border border-dashed border-border bg-surface px-6 py-12 text-center">
            <p className="font-semibold">Aún no has emitido facturas</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea tu primera factura en menos de 60 segundos.
            </p>
            {limitReached ? (
              <button
                type="button"
                onClick={() => navigate({ to: "/profile" })}
                className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground"
              >
                {data?.hasActiveSubscription ? "Ver planes" : "Elegir un plan"}{" "}
                <ChevronRight className="size-4" />
              </button>
            ) : (
              <Link
                to="/invoices/new"
                className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background"
              >
                Nueva factura <ChevronRight className="size-4" />
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    issued: { label: "Vigente", cls: "bg-primary-soft text-primary" },
    draft: { label: "Borrador", cls: "bg-muted text-muted-foreground" },
    cancelled: { label: "Cancelada", cls: "bg-destructive/10 text-destructive" },
    error: { label: "Error", cls: "bg-destructive/10 text-destructive" },
  };
  const v = map[status] ?? map.draft;
  return (
    <span
      className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${v.cls}`}
    >
      <span className="size-1.5 rounded-full bg-current" /> {v.label}
    </span>
  );
}
