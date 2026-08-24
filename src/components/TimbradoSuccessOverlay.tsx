import { Link } from "@tanstack/react-router";
import { Copy, FileCheck2 } from "lucide-react";

interface TimbradoSuccessOverlayProps {
  open: boolean;
  onClose: () => void;
  /** UUID/folio fiscal confirmado por el PAC. */
  folioFiscal?: string | null;
}

export function TimbradoSuccessOverlay({
  open,
  onClose,
  folioFiscal,
}: TimbradoSuccessOverlayProps) {
  if (!open) return null;
  const uuid = folioFiscal ?? "3F7C2E1B-8B4A-4D1F-9E4B-B7F8E1C4A2D6";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Factura timbrada"
      className="fixed inset-0 z-50 grid place-items-center bg-background px-5 py-8"
    >
      <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-6 text-center shadow-card sm:p-8">
        <div className="relative mx-auto grid size-24 place-items-center rounded-3xl bg-primary-soft text-primary">
          <FileCheck2 className="size-12" strokeWidth={1.6} />
          <span className="absolute -bottom-2 -right-2 grid size-9 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground ring-4 ring-surface">
            ✓
          </span>
        </div>

        <h2 className="mt-8 text-2xl font-bold tracking-tight">¡Factura timbrada!</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Tu factura ha sido generada correctamente.
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-muted/50 p-4 text-left">
          <p className="text-xs font-semibold">Folio fiscal</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-muted-foreground">{uuid}</p>
            <Copy className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
        >
          Ver factura
        </button>
        <Link
          to="/history"
          className="mt-4 inline-flex text-sm font-semibold text-primary transition hover:opacity-80"
        >
          Ir a mis facturas
        </Link>
      </div>
    </div>
  );
}
