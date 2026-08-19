import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ChevronRight,
  FileBarChart,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  ReceiptText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { CreditCardIcon } from "@/components/icons/credit-card-icon";
import { supabase } from "@/integrations/supabase/client";
import { isCsdConfigured, loadCompanyProfile } from "@/features/profile/company-profile";
import { signOutFactio } from "@/lib/sign-out";
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

export const Route = createFileRoute("/_authenticated/profile/")({ component: Profile });

interface PlanRow {
  id: string;
  key: string;
  nombre: string;
  precio_mxn: number;
  facturas_incluidas: number;
  features: Record<string, boolean>;
}
interface SubscriptionRow {
  id: string;
  plan_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

async function loadProfile() {
  const baseProfile = await loadCompanyProfile();
  const [plansRes, subRes, walletRes] = await Promise.all([
    supabase
      .from("plans")
      .select("id, key, nombre, precio_mxn, facturas_incluidas, features")
      .eq("is_active", true)
      .order("precio_mxn"),
    baseProfile.company
      ? supabase
          .from("subscriptions")
          .select("id, plan_id, status, current_period_end, cancel_at_period_end")
          .eq("company_id", baseProfile.company.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    baseProfile.company
      ? supabase
          .from("stamp_wallets")
          .select("balance")
          .eq("company_id", baseProfile.company.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    ...baseProfile,
    plans: (plansRes.data as PlanRow[]) ?? [],
    subscription: subRes.data as SubscriptionRow | null,
    walletBalance: (walletRes.data as { balance?: number } | null)?.balance ?? null,
  };
}

async function getFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.json();
      if (body?.error) return body.error as string;
    } catch {
      /* fallback */
    }
  }
  return error instanceof Error ? error.message : fallback;
}

function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["profile"], queryFn: loadProfile });
  const [showPlans, setShowPlans] = useState(false);
  const [subscribingPlan, setSubscribingPlan] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("suscripcion");
    if (status === "exito") {
      toast.success("¡Suscripción activada! Puede tardar unos segundos en reflejarse.");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    }
    if (status === "cancelada") toast.info("Pago cancelado. No se realizó ningún cargo.");
    if (status) {
      params.delete("suscripcion");
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${params.toString() ? `?${params}` : ""}`,
      );
    }
  }, [queryClient]);

  async function subscribe(planKey: string) {
    setSubscribingPlan(planKey);
    try {
      const { data: result, error } = await supabase.functions.invoke("create-checkout-session", {
        body: { plan_key: planKey },
      });
      if (error) {
        toast.error(await getFunctionErrorMessage(error, "No pudimos iniciar el pago."));
        return;
      }
      if (!result?.success || !result?.url) {
        toast.error(result?.error ?? "No pudimos iniciar el pago.");
        return;
      }
      window.location.href = result.url;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "No pudimos iniciar el pago.");
    } finally {
      setSubscribingPlan(null);
    }
  }

  async function signOut() {
    await signOutFactio(queryClient);
    navigate({ to: "/auth", replace: true });
  }

  async function cancelSubscription() {
    setCancelling(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("cancel-subscription");
      if (error) {
        toast.error(await getFunctionErrorMessage(error, "No pudimos cancelar tu suscripción."));
        return;
      }
      if (!result?.success) {
        toast.error(result?.error ?? "No pudimos cancelar tu suscripción.");
        return;
      }
      toast.success("Tu suscripción se cancelará al final del periodo actual.");
      setCancelOpen(false);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "No pudimos cancelar tu suscripción.");
    } finally {
      setCancelling(false);
    }
  }

  if (isLoading || !data)
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );

  const activeSub =
    data.subscription &&
    (data.subscription.status === "active" || data.subscription.status === "trialing")
      ? data.subscription
      : null;
  const activePlan = activeSub
    ? (data.plans.find((plan) => plan.id === activeSub.plan_id) ?? null)
    : null;
  const used = activePlan ? activePlan.facturas_incluidas - (data.walletBalance ?? 0) : 0;
  const usagePct = activePlan
    ? Math.min(100, Math.max(0, (used / activePlan.facturas_incluidas) * 100))
    : 0;
  const csdConfigured = isCsdConfigured(data.company);

  return (
    <div className="px-5 pt-[max(env(safe-area-inset-top),2.5rem)] pb-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Perfil del negocio
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          {data.company?.trade_name || data.company?.legal_name || "Mi negocio"}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">{data.user.email}</p>
      </header>

      <section className="mt-6 space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Información del negocio
        </h2>
        <ProfileLink
          to="/profile/fiscal"
          icon={Building2}
          title="Perfil fiscal"
          subtitle="Razón social, RFC y régimen fiscal"
        />
        <ProfileLink
          to="/profile/csd"
          icon={KeyRound}
          title="Certificado de sello digital"
          subtitle={csdConfigured ? "CSD configurado" : "Configúralo para poder timbrar"}
          badge={csdConfigured ? "Listo" : undefined}
        />
        <ProfileLink
          to="/profile/invoicing"
          icon={SlidersHorizontal}
          title="Valores por defecto de facturación"
          subtitle="Precarga el tipo de comprobante, método y forma de pago"
        />
        <ProfileLink
          to="/reports"
          icon={FileBarChart}
          title="Reportes y exportación"
          subtitle="Resumen mensual y CSV para tu contador"
        />
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Suscripción
        </h2>
        {activePlan && activeSub ? (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{activePlan.nombre}</p>
                <p className="text-xs text-muted-foreground">${activePlan.precio_mxn} MXN/mes</p>
              </div>
              <CreditCardIcon size={20} color="var(--primary)" />
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  Llevas {used} de {activePlan.facturas_incluidas} facturas este mes
                </span>
                <span>{Math.round(usagePct)}%</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${usagePct >= 100 ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
            </div>
            {activeSub.cancel_at_period_end
              ? activeSub.current_period_end && (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800">
                    Tu suscripción se cancelará el{" "}
                    {new Date(activeSub.current_period_end).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "long",
                    })}
                    . Puedes seguir facturando hasta entonces.
                  </p>
                )
              : activeSub.current_period_end && (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Se renueva el{" "}
                    {new Date(activeSub.current_period_end).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "long",
                    })}
                  </p>
                )}
            {(data.walletBalance ?? 0) <= 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800">
                <Zap className="mt-0.5 size-3.5 shrink-0" />
                Se te acabaron los timbres de este mes. Sube de plan para seguir facturando.
              </div>
            )}
            <Link
              to="/profile/receipts"
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-background py-2.5 text-xs font-semibold text-foreground"
            >
              <ReceiptText className="size-3.5" />
              Historial de cobros
            </Link>
            <button
              type="button"
              onClick={() => setShowPlans((visible) => !visible)}
              className="mt-2 w-full rounded-xl border border-border bg-background py-2.5 text-xs font-semibold text-foreground"
            >
              {showPlans ? "Ocultar planes" : "Ver otros planes"}
            </button>
            {!activeSub.cancel_at_period_end && (
              <button
                type="button"
                onClick={() => setCancelOpen(true)}
                className="mt-2 w-full rounded-xl py-2.5 text-xs font-semibold text-destructive"
              >
                Cancelar suscripción
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Aún no tienes una suscripción activa. Elige un plan para poder timbrar tus facturas.
          </p>
        )}
        {(!activePlan || showPlans) && (
          <div className="space-y-2.5">
            {data.plans.map((plan) => {
              const isCurrentPlan = plan.id === activePlan?.id;
              return (
                <div key={plan.id} className="rounded-2xl border border-border bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{plan.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        ${plan.precio_mxn} MXN/mes · Hasta {plan.facturas_incluidas} facturas
                      </p>
                    </div>
                    {isCurrentPlan ? (
                      <span className="rounded-full bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground">
                        Plan actual
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => subscribe(plan.key)}
                        disabled={subscribingPlan === plan.key}
                        className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background disabled:opacity-60"
                      >
                        {subscribingPlan === plan.key ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          "Suscribirme"
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Cuenta
        </h2>
        <ProfileLink
          to="/settings"
          icon={Settings}
          title="Configuración"
          subtitle="Notificaciones, tema, biometría"
        />
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 text-left transition active:scale-[0.99]"
        >
          <div className="grid size-10 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <LogOut className="size-4" />
          </div>
          <div className="flex-1">
            <p className="font-semibold">Cerrar sesión</p>
            <p className="text-xs text-muted-foreground">Salir de Factio</p>
          </div>
        </button>
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Ayuda
        </h2>
        <a
          href="mailto:soporte@factio.mx"
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 transition active:scale-[0.99]"
        >
          <div className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
            <Mail className="size-4" />
          </div>
          <div className="flex-1">
            <p className="font-semibold">Soporte</p>
            <p className="text-xs text-muted-foreground">soporte@factio.mx</p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground/70" />
        </a>
      </section>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
        <ShieldCheck className="size-3" />
        Tus datos viajan cifrados y solo tú los ves.
      </p>

      <AlertDialog open={cancelOpen} onOpenChange={(open) => !cancelling && setCancelOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar tu suscripción?</AlertDialogTitle>
            <AlertDialogDescription>
              Seguirás teniendo acceso y podrás timbrar facturas hasta el final del periodo que ya
              pagaste. Después de esa fecha no se te volverá a cobrar y perderás la capacidad de
              timbrar hasta que te suscribas de nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                cancelSubscription();
              }}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? <Loader2 className="size-4 animate-spin" /> : "Sí, cancelar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProfileLink({
  to,
  icon: Icon,
  title,
  subtitle,
  badge,
}: {
  to: "/profile/fiscal" | "/profile/csd" | "/profile/invoicing" | "/reports" | "/settings";
  icon: typeof Settings;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 transition active:scale-[0.99]"
    >
      <div className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
        <Icon className="size-4" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold">{title}</p>
          {badge && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ChevronRight className="size-4 text-muted-foreground/70" />
    </Link>
  );
}
