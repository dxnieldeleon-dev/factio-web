import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  CircleCheck,
  Clock,
  FileWarning,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserRoundCog,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatRelativeMX } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

const PAGE_SIZE = 50;

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

async function loadNotifications(limit: number): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, body, kind, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// Mapeo simple kind → ícono del lado del cliente, en el mismo espíritu que
// CATEGORY_BY_KIND en _shared/notify.ts (pero por tipo de evento, no por
// categoría de preferencia) — un kind sin mapeo cae a la campana genérica.
const ICON_BY_KIND: Record<string, LucideIcon> = {
  payment_failed: FileWarning,
  payment_recovered: CircleCheck,
  plan_changed: RefreshCw,
  invoice_stamped: CircleCheck,
  invoice_stamp_error: FileWarning,
  invoice_cancelled: XCircle,
  invoice_cancel_rejected: FileWarning,
  stamps_low: ShieldAlert,
  csd_uploaded: ShieldCheck,
  csd_expiring_60: ShieldAlert,
  csd_expiring_30: ShieldAlert,
  csd_expiring_7: ShieldAlert,
  onboarding_incomplete: UserRoundCog,
  inactivity_reminder: Clock,
  cfdi_cancel_deadline: Clock,
  cancellation_acceptance_overdue: Clock,
};

function iconForKind(kind: string): LucideIcon {
  return ICON_BY_KIND[kind] ?? Bell;
}

function NotificationsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["notifications", "list", limit],
    queryFn: () => loadNotifications(limit),
    placeholderData: keepPreviousData,
  });

  const notifications = data ?? [];
  const hasMore = notifications.length >= limit;

  async function openNotification(notification: NotificationRow) {
    if (!notification.read_at) {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notification.id);
      if (!error) qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (notification.link) {
      // El link viene de la base (kind → ruta ya resuelta por el backend, p.
      // ej. `/invoices/${id}`) y no de una constante literal, así que el
      // router tipado no puede validarlo en tiempo de compilación.
      navigate({ to: notification.link as never });
    }
  }

  async function markAllRead() {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (error) {
      toast.error("No pudimos marcar las notificaciones como leídas");
      return;
    }
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  const hasUnread = notifications.some((n) => !n.read_at);

  return (
    <div className="px-5 pt-[max(env(safe-area-inset-top),2.5rem)] pb-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="grid size-10 place-items-center rounded-full border border-border bg-surface"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <h1 className="text-xl font-bold tracking-tight">Notificaciones</h1>
        </div>
        {hasUnread && (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-semibold text-muted-foreground"
          >
            <CheckCheck className="size-3.5" /> Marcar todas como leídas
          </button>
        )}
      </header>

      <div className="mt-6">
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-2xl border border-border bg-surface"
              />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No tienes notificaciones"
            description="Aquí verás avisos sobre tus facturas, tu CSD y tu suscripción."
          />
        ) : (
          <>
            <ul className="space-y-2">
              {notifications.map((notification) => {
                const Icon = iconForKind(notification.kind);
                const unread = !notification.read_at;
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(notification)}
                      className="flex w-full items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-left transition active:scale-[0.99]"
                    >
                      <div className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                        <Icon className="size-[18px]" strokeWidth={1.8} />
                        {unread && (
                          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-destructive ring-2 ring-surface" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`font-semibold ${unread ? "" : "text-muted-foreground"}`}>
                          {notification.title}
                        </p>
                        {notification.body && (
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {notification.body}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          {formatRelativeMX(notification.created_at)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            {hasMore && (
              <button
                type="button"
                disabled={isFetching}
                onClick={() => setLimit((n) => n + PAGE_SIZE)}
                className="mt-4 w-full rounded-2xl border border-border bg-surface py-3 text-sm font-semibold text-muted-foreground disabled:opacity-60"
              >
                {isFetching ? "Cargando…" : "Cargar más"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
