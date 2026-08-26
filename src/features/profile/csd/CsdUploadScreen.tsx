import { useRef, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, ShieldCheck, Upload } from "lucide-react";
import type { useCsdUpload } from "./useCsdUpload";

interface CsdUploadScreenProps {
  csd: ReturnType<typeof useCsdUpload>;
  onValidated: () => void;
}

export function CsdUploadScreen({ csd, onValidated }: CsdUploadScreenProps) {
  const cerInputRef = useRef<HTMLInputElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function handleValidate() {
    const ok = await csd.save();
    if (ok) onValidated();
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Sube tu Certificado de Sello Digital</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Necesitamos tu archivo .cer, tu llave privada .key y la contraseña con la que la generaste
          en el SAT.
        </p>
      </div>
      {/* Android maps `accept` extensions to MIME types via the OS registry; .cer/.key
          aren't registered on most phones, so without a binary fallback the file picker
          greys out every file as "not allowed". */}
      <input
        ref={cerInputRef}
        type="file"
        accept=".cer,application/x-x509-ca-cert,application/pkix-cert,application/octet-stream"
        className="hidden"
        onChange={(e) => csd.setCerFile(e.target.files?.[0] ?? null)}
      />
      <input
        ref={keyInputRef}
        type="file"
        accept=".key,application/octet-stream"
        className="hidden"
        onChange={(e) => csd.setKeyFile(e.target.files?.[0] ?? null)}
      />
      <FileField
        label="Certificado (.cer)"
        file={csd.cerFile}
        existing={csd.hasExistingFiles}
        onClick={() => cerInputRef.current?.click()}
      />
      <FileField
        label="Llave privada (.key)"
        file={csd.keyFile}
        existing={csd.hasExistingFiles}
        onClick={() => keyInputRef.current?.click()}
      />
      <Field label="Contraseña del CSD">
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={csd.password}
            onChange={(e) => csd.setPassword(e.target.value)}
            placeholder="Contraseña de tu llave privada"
            className="ff-input pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-label={showPassword ? "Ocultar" : "Mostrar"}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Nunca se guarda: solo se usa para validar y se descarta de inmediato.
        </p>
      </Field>
      <label className="flex items-start gap-2.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={csd.consentGiven}
          onChange={(e) => csd.setConsentGiven(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 rounded border-input"
        />
        <span>
          Autorizo el uso de mi Certificado de Sello Digital (CSD) para el timbrado y cancelación
          de mis CFDIs a través del PAC autorizado.
        </span>
      </label>
      {csd.error && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive">
          {csd.error}
        </p>
      )}
      <button
        type="button"
        onClick={handleValidate}
        disabled={!csd.canSave || csd.saving}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground py-4 text-sm font-semibold text-background transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {csd.saving ? <Loader2 className="size-4 animate-spin" /> : "Validar archivos"}
      </button>
      <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        Tus archivos CSD se guardan cifrados y solo son accesibles por ti.
      </p>
    </section>
  );
}

function FileField({
  label,
  file,
  existing,
  onClick,
}: {
  label: string;
  file: File | null;
  existing: boolean;
  onClick: () => void;
}) {
  return (
    <Field label={label}>
      <button
        type="button"
        onClick={onClick}
        className="ff-input flex items-center gap-2 text-left"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <Upload className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            {file?.name ?? `Seleccionar archivo ${label.match(/\(.+\)/)?.[0] ?? ""}`}
          </span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-primary">
          {file ? "Cambiar" : "Subir"}
        </span>
      </button>
      {!file && existing && (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-700">
          <CheckCircle2 className="size-3" />
          Archivo cargado
        </p>
      )}
    </Field>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
