import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Trash2, Upload, Package } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { COMMON_SAT_KEYS, COMMON_SAT_UNITS } from "@/lib/sat-catalogs";
import { SatKeyPicker } from "@/components/sat-key-picker";
import { isValidProductImage, uploadProductImage } from "@/lib/product-images";
import { logSatKeySearchMiss } from "@/lib/sat-key-miss";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/products/$id_/edit")({
  component: EditProduct,
});

type Product = {
  id: string;
  description: string;
  sat_key: string;
  sat_unit: string;
  unit_price: number;
  iva_rate: number;
  tax_object: "01" | "02";
  isr_retencion_rate: number | null;
  iva_retencion_rate: number | null;
  internal_code: string | null;
  category: string | null;
  image_url: string | null;
};

async function loadProduct(id: string): Promise<Product> {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, description, sat_key, sat_unit, unit_price, iva_rate, tax_object, isr_retencion_rate, iva_retencion_rate, internal_code, category, image_url",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Producto no encontrado");
  return data as Product;
}

function EditProduct() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["products", id],
    queryFn: () => loadProduct(id),
  });
  const [form, setForm] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [hasRetention, setHasRetention] = useState(false);

  useEffect(() => {
    if (data) {
      setForm(data);
      setHasRetention(data.isr_retencion_rate !== null || data.iva_retencion_rate !== null);
    }
  }, [data]);
  function set<K extends keyof Product>(key: K, value: Product[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function onTaxObjectChange(next: "01" | "02") {
    set("tax_object", next);
    if (next === "01") set("iva_rate", 0);
    else if (form?.iva_rate === 0) set("iva_rate", 0.16);
  }

  function onHasRetentionChange(next: boolean) {
    setHasRetention(next);
    if (!next) {
      set("isr_retencion_rate", null);
      set("iva_retencion_rate", null);
    } else {
      set("isr_retencion_rate", form?.isr_retencion_rate ?? 0);
      set("iva_retencion_rate", form?.iva_retencion_rate ?? 0);
    }
  }

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

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    if (!form.description.trim()) return toast.error("La descripción es requerida");
    if (!Number.isFinite(form.unit_price) || form.unit_price < 0)
      return toast.error("Precio inválido");
    setSaving(true);
    try {
      let imageUrl = form.image_url;
      if (imageFile) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          try {
            imageUrl = await uploadProductImage(userData.user.id, id, imageFile);
          } catch (imgErr) {
            console.error("[products.edit] image upload failed", imgErr);
            toast.warning("No pudimos subir la foto, se guardará el resto de los cambios.");
          }
        }
      }
      const { error: updateError } = await supabase
        .from("products")
        .update({
          description: form.description.trim(),
          sat_key: form.sat_key,
          sat_unit: form.sat_unit,
          unit_price: form.unit_price,
          iva_rate: form.iva_rate,
          tax_object: form.tax_object,
          isr_retencion_rate: hasRetention ? form.isr_retencion_rate : null,
          iva_retencion_rate: hasRetention ? form.iva_retencion_rate : null,
          internal_code: form.internal_code?.trim() || null,
          category: form.category?.trim() || null,
          image_url: imageUrl,
        })
        .eq("id", id);
      if (updateError) throw updateError;
      toast.success("Producto actualizado");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      navigate({ to: "/products" });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "No pudimos guardar los cambios");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      const { error: deleteError } = await supabase.from("products").delete().eq("id", id);
      if (deleteError) throw deleteError;
      toast.success("Producto eliminado");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      navigate({ to: "/products" });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "No pudimos eliminar el producto");
      setDeleting(false);
    }
  }

  if (isLoading || !form)
    return (
      <div className="px-5 pt-12">
        <div className="h-10 w-40 animate-pulse rounded-full bg-muted" />
      </div>
    );
  if (error)
    return (
      <div className="px-5 pt-12">
        <p className="text-destructive">{error.message}</p>
        <Link to="/products">Volver</Link>
      </div>
    );

  return (
    <div className="px-5 pt-[max(env(safe-area-inset-top),2.5rem)] pb-6">
      <header className="flex items-center gap-3">
        <Link
          to="/products"
          className="grid size-10 place-items-center rounded-full border border-border bg-surface"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-xl font-bold">Editar producto</h1>
      </header>
      <form onSubmit={save} className="mt-6 space-y-4">
        <label className="flex items-center gap-3">
          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-input bg-muted">
            {imagePreview || form.image_url ? (
              <img
                src={imagePreview ?? form.image_url ?? undefined}
                alt="Vista previa"
                className="size-full object-cover"
              />
            ) : (
              <Package className="size-6 text-muted-foreground" />
            )}
          </div>
          <span className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-input bg-background px-4 py-2 text-xs font-medium hover:bg-accent">
            <Upload className="size-4" />
            {form.image_url || imageFile ? "Cambiar foto" : "Agregar foto (opcional)"}
            <input type="file" accept="image/*" className="hidden" onChange={onImageChange} />
          </span>
        </label>
        <Field label="Descripción">
          <input
            className="ff-input"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
        <Field
          label="Clave SAT"
          hint="Describe qué vendes; el SAT usa este código para clasificarlo. Si no encuentras algo parecido, usa «No existe en el catálogo»."
        >
          <SatKeyPicker
            value={form.sat_key}
            onChange={(code) => set("sat_key", code)}
            items={COMMON_SAT_KEYS}
            onFallbackSelected={(searchTerm) => logSatKeySearchMiss("product_edit", searchTerm)}
          />
        </Field>
        <Field
          label="Unidad SAT"
          hint="Cómo se mide lo que vendes (por servicio, por hora, por pieza…)."
        >
          <select
            className="ff-input"
            value={form.sat_unit}
            onChange={(e) => set("sat_unit", e.target.value)}
          >
            {COMMON_SAT_UNITS.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code} — {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Precio unitario">
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className="ff-input font-mono"
              style={{ paddingLeft: "1.75rem" }}
              value={form.unit_price}
              onChange={(e) => set("unit_price", Number(e.target.value))}
              onFocus={(e) => e.target.select()}
            />
          </div>
        </Field>
        <Field
          label="¿Es objeto de impuesto?"
          hint="La gran mayoría de productos y servicios sí lo son. Marca «No» solo para casos exentos (ej. donativos, ciertas actividades sin IVA)."
        >
          <div className="flex gap-2 rounded-2xl bg-muted p-1">
            <button
              type="button"
              onClick={() => onTaxObjectChange("02")}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${form.tax_object === "02" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              Sí
            </button>
            <button
              type="button"
              onClick={() => onTaxObjectChange("01")}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${form.tax_object === "01" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              No
            </button>
          </div>
        </Field>
        {form.tax_object === "02" ? (
          <Field
            label="IVA"
            hint="16% aplica casi siempre. Usa 8% solo si facturas desde zona fronteriza."
          >
            <select
              className="ff-input"
              value={form.iva_rate}
              onChange={(e) => set("iva_rate", Number(e.target.value))}
            >
              <option value="0.16">16%</option>
              <option value="0.08">8%</option>
              <option value="0">0% / Exento</option>
            </select>
          </Field>
        ) : (
          <p className="rounded-2xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
            Este producto o servicio no llevará IVA al facturarlo.
          </p>
        )}
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
                className="ff-input"
                value={form.isr_retencion_rate ?? 0}
                onChange={(e) => set("isr_retencion_rate", Number(e.target.value))}
              >
                <option value={0}>0% (sin retención)</option>
                <option value={0.0125}>1.25% (RESICO 626 → persona moral)</option>
                <option value={0.1}>10% (Actividad Empresarial 612 → persona moral)</option>
              </select>
            </Field>
            <Field
              label="Retención de IVA"
              hint="Esta tasa fija solo se aplicará al facturar a personas morales; a personas físicas nunca se retiene."
            >
              <select
                className="ff-input"
                value={form.iva_retencion_rate ?? 0}
                onChange={(e) => set("iva_retencion_rate", Number(e.target.value))}
              >
                <option value={0}>0% (sin retención)</option>
                <option value={0.106667}>10.6667% (persona moral, 612 o 626)</option>
              </select>
            </Field>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Código interno" hint="Para tu propio catálogo; no aparece en la factura.">
            <input
              className="ff-input"
              value={form.internal_code ?? ""}
              onChange={(e) => set("internal_code", e.target.value)}
            />
          </Field>
          <Field label="Categoría" hint="Te ayuda a organizar tu catálogo.">
            <input
              className="ff-input"
              value={form.category ?? ""}
              onChange={(e) => set("category", e.target.value)}
            />
          </Field>
        </div>
        <button
          disabled={saving}
          className="flex w-full justify-center rounded-2xl bg-foreground py-4 text-sm font-semibold text-background disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Guardar cambios"}
        </button>
      </form>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            disabled={deleting}
            className="mt-3 flex w-full justify-center gap-2 rounded-2xl border border-destructive/30 py-3.5 text-sm font-semibold text-destructive"
          >
            {deleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Trash2 className="size-4" />
                Eliminar producto
              </>
            )}
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este producto?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <style>{`.ff-input{width:100%;border-radius:1rem;border:1px solid var(--input);background:var(--surface);padding:.875rem 1rem;font-size:.9rem}`}</style>
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
