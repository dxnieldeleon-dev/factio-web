import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { loadCompanyProfile } from "@/features/profile/company-profile";
import { loadInvoiceProfile, saveInvoiceProfile } from "@/features/profile/invoice-profile";
import { CFDI_TYPES, EXPORT_CODES, PAYMENT_METHODS, PAYMENT_FORMS } from "@/lib/sat-catalogs";
import { validatePayment } from "@/lib/fiscal";

export const Route = createFileRoute("/_authenticated/profile/invoicing")({
  component: InvoicingProfilePage,
});

type Form = {
  cfdi_type: string;
  export_code: string;
  currency: string;
  payment_method: string;
  payment_form: string;
};

const DEFAULTS: Form = {
  cfdi_type: "I",
  export_code: "01",
  currency: "MXN",
  payment_method: "PUE",
  payment_form: "03",
};

function InvoicingProfilePage() {
  const queryClient = useQueryClient();
  const { data: companyProfile, isLoading: companyLoading } = useQuery({
    queryKey: ["company-profile"],
    queryFn: loadCompanyProfile,
  });
  const company = companyProfile?.company ?? null;

  const { data: invoiceProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["invoice-profile", company?.id],
    queryFn: () => loadInvoiceProfile(company!.id),
    enabled: !!company?.id,
  });

  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const current: Form = form ?? {
    cfdi_type: invoiceProfile?.cfdi_type ?? DEFAULTS.cfdi_type,
    export_code: invoiceProfile?.export_code ?? DEFAULTS.export_code,
    currency: invoiceProfile?.currency ?? DEFAULTS.currency,
    payment_method: invoiceProfile?.payment_method ?? DEFAULTS.payment_method,
    payment_form: invoiceProfile?.payment_form ?? DEFAULTS.payment_form,
  };

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm({ ...current, [key]: value });
  }

  const paymentError = validatePayment(current.payment_method, current.payment_form);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!companyProfile || !company) return;
    if (paymentError) {
      toast.error(paymentError);
      return;
    }

    setSaving(true);
    try {
      await saveInvoiceProfile(companyProfile.user.id, company.id, current);
      toast.success("Valores por defecto guardados");
      await queryClient.invalidateQueries({ queryKey: ["invoice-profile", company.id] });
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "No pudimos guardar tus valores por defecto",
      );
    } finally {
      setSaving(false);
    }
  }

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
          <h1 className="text-xl font-bold tracking-tight">Valores por defecto de facturación</h1>
        </div>
      </header>

      {companyLoading || profileLoading ? (
        <div className="mt-10 grid place-items-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : !company ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-4 text-center text-sm text-muted-foreground">
          Primero configura tu{" "}
          <Link to="/profile/fiscal" className="font-semibold text-primary">
            perfil fiscal
          </Link>{" "}
          para poder guardar tus valores por defecto de facturación.
        </div>
      ) : (
        <form onSubmit={save} className="mt-6 space-y-4">
          <div className="rounded-2xl bg-primary-soft px-4 py-3 text-xs text-primary">
            Estos valores se precargan cada vez que emites una factura, para no tener que elegirlos
            siempre a mano. Puedes cambiarlos en una factura puntual sin afectar este valor por
            defecto.
          </div>

          <Field label="Tipo de comprobante">
            <select
              value={current.cfdi_type}
              onChange={(e) => set("cfdi_type", e.target.value)}
              className="ff-input"
            >
              {CFDI_TYPES.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.code} — {t.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Exportación">
            <select
              value={current.export_code}
              onChange={(e) => set("export_code", e.target.value)}
              className="ff-input"
            >
              {EXPORT_CODES.map((e2) => (
                <option key={e2.code} value={e2.code}>
                  {e2.code} — {e2.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Moneda">
            {/* Restringido a MXN: el proyecto no tiene fuente de tipo de
                cambio en vivo (ver src/lib/duplicate-invoice.ts), así que
                el tipo de cambio siempre se captura a mano por factura.
                TODO: permitir otras monedas aquí una vez que exista una
                integración de tipo de cambio (ej. Banxico). */}
            <select value={current.currency} disabled className="ff-input opacity-60">
              <option value="MXN">MXN — Peso Mexicano</option>
            </select>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Por ahora solo se puede facturar en pesos por defecto. Para otra moneda, cámbiala en
              cada factura desde "Opciones avanzadas".
            </p>
          </Field>

          <Field
            label="Método de pago"
            error={paymentError && current.payment_method === "PPD" ? paymentError : undefined}
          >
            <select
              value={current.payment_method}
              onChange={(e) => set("payment_method", e.target.value)}
              className="ff-input"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.code} — {m.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Forma de pago"
            error={paymentError && current.payment_method !== "PPD" ? paymentError : undefined}
          >
            <select
              value={current.payment_form}
              onChange={(e) => set("payment_form", e.target.value)}
              className="ff-input"
            >
              {PAYMENT_FORMS.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.code} — {f.name}
                </option>
              ))}
            </select>
          </Field>

          <button
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground py-4 text-sm font-semibold text-background transition active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Guardar valores por defecto"}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string | null;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
      {error && (
        <span className="mt-1.5 block text-[11px] font-medium text-destructive">{error}</span>
      )}
    </label>
  );
}
