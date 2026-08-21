import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Upload, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { COMMON_SAT_KEYS, COMMON_SAT_UNITS } from "@/lib/sat-catalogs";
import { useQueryClient } from "@tanstack/react-query";
import { SatKeyPicker } from "@/components/sat-key-picker";
import { isValidProductImage, uploadProductImage } from "@/lib/product-images";
import { logSatKeySearchMiss } from "@/lib/sat-key-miss";

export const Route = createFileRoute("/_authenticated/products/new")({
  component: NewProduct,
});

type ServiceType = { id: string; name: string; sat_key: string; sat_unit: string };

const OTHER_SERVICE = "__other__";

function NewProduct() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    description: "",
    sat_key: "01010101",
    sat_unit: "E48",
    unit_price: "",
    iva_rate: "0.16",
    internal_code: "",
    category: "",
  });
  // Espeja la pregunta del SAT al timbrar: "¿es objeto de impuesto?". Solo
  // exponemos 01 (No) / 02 (Sí) — el catálogo c_ObjetoImp también tiene 03/04
  // para casos especiales (comercio exterior, ciertos donativos) que no
  // aplican al perfil de usuario de esta app.
  const [taxObject, setTaxObject] = useState<"01" | "02">("02");

  function onTaxObjectChange(next: "01" | "02") {
    setTaxObject(next);
    if (next === "01") set("iva_rate", "0");
    else if (form.iva_rate === "0") set("iva_rate", "0.16");
  }

  // Override manual del motor automático de retenciones (que calcula por
  // régimen del emisor + tipo de cliente al facturar). Sin marcar, el
  // producto no fuerza nada y se sigue calculando como hoy; si se marca,
  // esta tasa manda para este producto — pero solo cuando el receptor sea
  // persona moral, nunca a persona física (eso lo aplica el servidor).
  const [hasRetention, setHasRetention] = useState(false);
  const [isrRetencionRate, setIsrRetencionRate] = useState("0");
  const [ivaRetencionRate, setIvaRetencionRate] = useState("0");

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  function onImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const problem = isValidProductImage(f);
    if (problem) {
      toast.error(problem);
      return;
    }
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  }

  // Perfil de actividad de la empresa (Parte 1 de clasificación fiscal): si
  // existe, ofrecemos un catálogo simplificado de servicios con clave y
  // unidad SAT ya asignadas, con "Otro servicio" como salida al formulario avanzado.
  const [profileLoading, setProfileLoading] = useState(true);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const hasProfile = serviceTypes.length > 0;
  // Los perfiles de comercio (activity_category = 'actividad_empresarial_general')
  // no traen activity_profile_service_types precargados a propósito — la
  // variedad de productos es demasiado amplia para un catálogo curado — así
  // que en vez de sugerencias rápidas, se abre directo el buscador de Clave SAT.
  const [isCommerceProfile, setIsCommerceProfile] = useState(false);
  const [kind, setKind] = useState<"servicio" | "producto">("servicio");
  const [serviceTypeId, setServiceTypeId] = useState<string>("");

  const returnTo = useMemo(() => new URLSearchParams(window.location.search).get("return_to"), []);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setProfileLoading(false);
        return;
      }
      const { data: company } = await supabase
        .from("companies")
        .select("activity_profile_id")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (company?.activity_profile_id) {
        const [{ data: types }, { data: profile }] = await Promise.all([
          supabase
            .from("activity_profile_service_types")
            .select("id, name, sat_key, sat_unit")
            .eq("activity_profile_id", company.activity_profile_id)
            .eq("is_active", true)
            .order("sort_order"),
          supabase
            .from("activity_profiles")
            .select("activity_category")
            .eq("id", company.activity_profile_id)
            .maybeSingle(),
        ]);
        setServiceTypes(types ?? []);
        setIsCommerceProfile(profile?.activity_category === "actividad_empresarial_general");
      }
      setProfileLoading(false);
    })();
  }, []);

  const showSimplifiedService =
    hasProfile && kind === "servicio" && serviceTypeId !== OTHER_SERVICE;
  const showAdvancedForm = !hasProfile || kind === "producto" || serviceTypeId === OTHER_SERVICE;

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function onSelectServiceType(id: string) {
    setServiceTypeId(id);
    if (id === OTHER_SERVICE || id === "") {
      return;
    }
    const type = serviceTypes.find((t) => t.id === id);
    if (type) {
      setForm((f) => ({
        ...f,
        description: type.name,
        sat_key: type.sat_key,
        sat_unit: type.sat_unit,
      }));
    }
  }

  function onKindChange(next: "servicio" | "producto") {
    setKind(next);
    setServiceTypeId("");
    if (next === "producto") {
      setForm((f) => ({ ...f, description: "", sat_key: "01010101", sat_unit: "E48" }));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (showSimplifiedService && !serviceTypeId) {
      toast.error("Selecciona el tipo de servicio");
      return;
    }
    if (!form.description.trim()) {
      toast.error("El nombre del producto o servicio es requerido");
      return;
    }
    const price = parseFloat(form.unit_price);
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Precio inválido");
      return;
    }
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: inserted, error } = await supabase
        .from("products")
        .insert({
          user_id: userData.user!.id,
          description: form.description.trim(),
          sat_key: form.sat_key,
          sat_unit: form.sat_unit,
          unit_price: price,
          iva_rate: parseFloat(form.iva_rate),
          tax_object: taxObject,
          isr_retencion_rate: hasRetention ? parseFloat(isrRetencionRate) : null,
          iva_retencion_rate: hasRetention ? parseFloat(ivaRetencionRate) : null,
          internal_code: form.internal_code.trim() || null,
          category: form.category.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (imageFile) {
        try {
          const imageUrl = await uploadProductImage(userData.user!.id, inserted.id, imageFile);
          await supabase.from("products").update({ image_url: imageUrl }).eq("id", inserted.id);
        } catch (imgErr) {
          console.error("[products.new] image upload failed", imgErr);
          toast.warning("Guardamos el producto, pero no pudimos subir la foto.");
        }
      }

      toast.success(showSimplifiedService ? "Servicio agregado" : "Producto agregado");
      qc.invalidateQueries({ queryKey: ["products"] });
      if (returnTo === "invoice") {
        window.location.href = `/invoices/new?resume_product=${inserted.id}`;
        return;
      }
      navigate({ to: "/products" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos guardar el producto");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-5 pt-[max(env(safe-area-inset-top),2.5rem)] pb-6">
      <header className="flex items-center gap-3">
        {returnTo === "invoice" ? (
          <a
            href="/invoices/new"
            className="grid size-10 place-items-center rounded-full border border-border bg-surface"
          >
            <ArrowLeft className="size-4" />
          </a>
        ) : (
          <Link
            to="/products"
            className="grid size-10 place-items-center rounded-full border border-border bg-surface"
          >
            <ArrowLeft className="size-4" />
          </Link>
        )}
        <h1 className="text-xl font-bold tracking-tight">
          {showSimplifiedService
            ? "Nuevo servicio"
            : hasProfile
              ? "Nuevo producto o servicio"
              : "Nuevo producto"}
        </h1>
      </header>

      {!profileLoading && hasProfile && (
        <div className="mt-6 flex gap-2 rounded-2xl bg-muted p-1">
          <button
            type="button"
            onClick={() => onKindChange("servicio")}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${kind === "servicio" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            Servicio
          </button>
          <button
            type="button"
            onClick={() => onKindChange("producto")}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${kind === "producto" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            Producto
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="flex items-center gap-3">
          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-input bg-muted">
            {imagePreview ? (
              <img src={imagePreview} alt="Vista previa" className="size-full object-cover" />
            ) : (
              <Package className="size-6 text-muted-foreground" />
            )}
          </div>
          <span className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-input bg-background px-4 py-2 text-xs font-medium hover:bg-accent">
            <Upload className="size-4" />
            {imageFile ? "Cambiar foto" : "Agregar foto (opcional)"}
            <input type="file" accept="image/*" className="hidden" onChange={onImageChange} />
          </span>
        </label>

        {hasProfile && kind === "servicio" && (
          <Field label="Tipo de servicio">
            <select
              value={serviceTypeId}
              onChange={(e) => onSelectServiceType(e.target.value)}
              className="ff-input"
              required
            >
              <option value="" disabled>
                Selecciona uno…
              </option>
              {serviceTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value={OTHER_SERVICE}>Otro servicio…</option>
            </select>
          </Field>
        )}

        {showSimplifiedService && (
          <>
            <Field label="Nombre del servicio" hint="Así aparecerá en tus facturas">
              <input
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                className="ff-input"
                required
              />
            </Field>
            <Field label="Precio unitario (MXN)">
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={form.unit_price}
                  onChange={(e) => set("unit_price", e.target.value)}
                  onFocus={(e) => e.target.select()}
                  placeholder="0.00"
                  className="ff-input font-mono"
                  style={{ paddingLeft: "1.75rem" }}
                  required
                />
              </div>
            </Field>
            <TaxObjectFields
              taxObject={taxObject}
              onTaxObjectChange={onTaxObjectChange}
              ivaRate={form.iva_rate}
              onIvaRateChange={(v) => set("iva_rate", v)}
            />
            <RetentionFields
              hasRetention={hasRetention}
              onHasRetentionChange={setHasRetention}
              isrRetencionRate={isrRetencionRate}
              onIsrRetencionRateChange={setIsrRetencionRate}
              ivaRetencionRate={ivaRetencionRate}
              onIvaRetencionRateChange={setIvaRetencionRate}
            />
          </>
        )}

        {showAdvancedForm && (
          <>
            <Field label="Nombre del producto o servicio" hint="Así aparecerá en tus facturas">
              <input
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Ej. Servicio de consultoría, Playera talla M…"
                className="ff-input"
                required
              />
            </Field>
            <Field
              label="Clave SAT"
              hint={
                isCommerceProfile
                  ? "Busca tu producto en el catálogo SAT."
                  : "Describe qué vendes; el SAT usa este código para clasificarlo. Si no encuentras algo parecido, usa «No existe en el catálogo»."
              }
            >
              <SatKeyPicker
                value={form.sat_key}
                onChange={(code) => set("sat_key", code)}
                items={COMMON_SAT_KEYS}
                onFallbackSelected={(searchTerm) => logSatKeySearchMiss("product_new", searchTerm)}
              />
            </Field>
            <Field
              label="Unidad SAT"
              hint="Cómo se mide lo que vendes (por servicio, por hora, por pieza…)."
            >
              <select
                value={form.sat_unit}
                onChange={(e) => set("sat_unit", e.target.value)}
                className="ff-input"
              >
                {COMMON_SAT_UNITS.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.code} — {u.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Precio unitario (MXN)">
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={form.unit_price}
                  onChange={(e) => set("unit_price", e.target.value)}
                  onFocus={(e) => e.target.select()}
                  placeholder="0.00"
                  className="ff-input font-mono"
                  style={{ paddingLeft: "1.75rem" }}
                  required
                />
              </div>
            </Field>
            <TaxObjectFields
              taxObject={taxObject}
              onTaxObjectChange={onTaxObjectChange}
              ivaRate={form.iva_rate}
              onIvaRateChange={(v) => set("iva_rate", v)}
            />
            <RetentionFields
              hasRetention={hasRetention}
              onHasRetentionChange={setHasRetention}
              isrRetencionRate={isrRetencionRate}
              onIsrRetencionRateChange={setIsrRetencionRate}
              ivaRetencionRate={ivaRetencionRate}
              onIvaRetencionRateChange={setIvaRetencionRate}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Código interno (opcional)"
                hint="Para tu propio catálogo; no aparece en la factura."
              >
                <input
                  value={form.internal_code}
                  onChange={(e) => set("internal_code", e.target.value)}
                  placeholder="PROD-001"
                  className="ff-input font-mono"
                />
              </Field>
              <Field label="Categoría (opcional)" hint="Te ayuda a organizar tu catálogo.">
                <input
                  value={form.category}
                  onChange={(e) => set("category", e.target.value)}
                  placeholder="Servicios"
                  className="ff-input"
                />
              </Field>
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground py-4 text-sm font-semibold text-background transition active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : "Guardar"}
        </button>
      </form>

      <style>{`.ff-input{width:100%;border-radius:1rem;border:1px solid var(--input);background:var(--surface);padding:0.875rem 1rem;font-size:0.9rem;outline:none}.ff-input:focus{border-color:var(--primary);box-shadow:0 0 0 4px var(--ring)}`}</style>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

// Refleja la pregunta que hace el propio portal del SAT al timbrar: primero
// si el concepto es objeto de impuesto, y solo si la respuesta es sí se
// piden los impuestos que le corresponden (aquí, IVA).
function TaxObjectFields({
  taxObject,
  onTaxObjectChange,
  ivaRate,
  onIvaRateChange,
}: {
  taxObject: "01" | "02";
  onTaxObjectChange: (next: "01" | "02") => void;
  ivaRate: string;
  onIvaRateChange: (next: string) => void;
}) {
  return (
    <>
      <Field
        label="¿Es objeto de impuesto?"
        hint="La gran mayoría de productos y servicios sí lo son. Marca «No» solo para casos exentos (ej. donativos, ciertas actividades sin IVA)."
      >
        <div className="flex gap-2 rounded-2xl bg-muted p-1">
          <button
            type="button"
            onClick={() => onTaxObjectChange("02")}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${taxObject === "02" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            Sí
          </button>
          <button
            type="button"
            onClick={() => onTaxObjectChange("01")}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${taxObject === "01" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            No
          </button>
        </div>
      </Field>
      {taxObject === "02" ? (
        <Field
          label="IVA"
          hint="16% aplica casi siempre. Usa 8% solo si facturas desde zona fronteriza."
        >
          <select
            value={ivaRate}
            onChange={(e) => onIvaRateChange(e.target.value)}
            className="ff-input"
          >
            <option value="0.16">16%</option>
            <option value="0.08">8% (frontera)</option>
            <option value="0">0% / Exento</option>
          </select>
        </Field>
      ) : (
        <p className="rounded-2xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
          Este producto o servicio no llevará IVA al facturarlo.
        </p>
      )}
    </>
  );
}

// Tasas confirmadas para 2026 (ver supabase/migrations/20260731020000_tax_withholding_rules.sql),
// las mismas que usa el diálogo "Editar impuestos" de una factura en borrador.
const ISR_RETENCION_OPTIONS = [
  { value: "0", label: "0% (sin retención)" },
  { value: "0.0125", label: "1.25% (RESICO 626 → persona moral)" },
  { value: "0.10", label: "10% (Actividad Empresarial 612 → persona moral)" },
];
const IVA_RETENCION_OPTIONS = [
  { value: "0", label: "0% (sin retención)" },
  { value: "0.106667", label: "10.6667% (persona moral, 612 o 626)" },
];

function RetentionFields({
  hasRetention,
  onHasRetentionChange,
  isrRetencionRate,
  onIsrRetencionRateChange,
  ivaRetencionRate,
  onIvaRetencionRateChange,
}: {
  hasRetention: boolean;
  onHasRetentionChange: (next: boolean) => void;
  isrRetencionRate: string;
  onIsrRetencionRateChange: (next: string) => void;
  ivaRetencionRate: string;
  onIvaRetencionRateChange: (next: string) => void;
}) {
  return (
    <>
      <Field
        label="¿Tiene impuestos retenidos?"
        hint="Normalmente esto se calcula solo al facturar, según tu régimen y el tipo de cliente. Actívalo solo si quieres forzar una tasa fija para este producto."
      >
        <div className="flex gap-2 rounded-2xl bg-muted p-1">
          <button
            type="button"
            onClick={() => onHasRetentionChange(false)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${!hasRetention ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            No (automático)
          </button>
          <button
            type="button"
            onClick={() => onHasRetentionChange(true)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${hasRetention ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            Sí, fijar tasa
          </button>
        </div>
      </Field>
      {hasRetention && (
        <>
          <Field label="Retención de ISR">
            <select
              value={isrRetencionRate}
              onChange={(e) => onIsrRetencionRateChange(e.target.value)}
              className="ff-input"
            >
              {ISR_RETENCION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Retención de IVA"
            hint="Esta tasa fija solo se aplicará al facturar a personas morales; a personas físicas nunca se retiene."
          >
            <select
              value={ivaRetencionRate}
              onChange={(e) => onIvaRetencionRateChange(e.target.value)}
              className="ff-input"
            >
              {IVA_RETENCION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
    </>
  );
}
