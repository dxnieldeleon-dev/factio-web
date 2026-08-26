// Lógica compartida de subida/validación del CSD — usada tanto en el
// onboarding como en Perfil > CSD, para no mantener dos copias del mismo
// flujo. Los archivos nunca se suben directo a Storage desde el cliente:
// se envían en base64 dentro del body de validate-csd, que es quien decide
// si los cifra y los persiste (ver ese archivo para el porqué).

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CompanyProfileData } from "../company-profile";

export interface CsdSuccessResult {
  serial_number: string;
  valid_from: string;
  valid_to: string;
  rfc: string;
}

async function getFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.json();
      if (body?.error) return body.error as string;
    } catch {
      // El cuerpo no era JSON o ya fue consumido.
    }
  }
  return error instanceof Error ? error.message : fallback;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo."));
    reader.onload = () => {
      const result = reader.result as string;
      // readAsDataURL produce "data:<mime>;base64,<contenido>" — solo interesa
      // lo que sigue de la coma.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function useCsdUpload(profile: CompanyProfileData) {
  const queryClient = useQueryClient();
  const [cerFile, setCerFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<"cer" | "key" | "password" | null>(null);
  const [result, setResult] = useState<CsdSuccessResult | null>(null);

  const hasExistingFiles = Boolean(profile.company?.csd_cer_url && profile.company?.csd_key_url);
  const hasReplacementFiles = Boolean(cerFile && keyFile);
  const canSave =
    (hasReplacementFiles || (!cerFile && !keyFile && hasExistingFiles)) &&
    password.length > 0 &&
    consentGiven;

  async function save(): Promise<boolean> {
    if (!profile.company) {
      setError("Primero guarda los datos fiscales del perfil.");
      return false;
    }
    setSaving(true);
    setError(null);
    setFieldError(null);
    try {
      const [cerBase64, keyBase64] = hasReplacementFiles
        ? await Promise.all([fileToBase64(cerFile!), fileToBase64(keyFile!)])
        : [undefined, undefined];

      const { data, error: functionError } = await supabase.functions.invoke("validate-csd", {
        body: {
          company_id: profile.company.id,
          password,
          cer_base64: cerBase64,
          key_base64: keyBase64,
          csd_usage_consent: consentGiven,
        },
      });
      if (functionError) {
        throw new Error(await getFunctionErrorMessage(functionError, "No pudimos validar tu CSD."));
      }
      if (!data?.success) {
        setFieldError(data?.field ?? null);
        throw new Error(data?.error ?? "No pudimos validar tu CSD.");
      }

      setResult({
        serial_number: data.serial_number,
        valid_from: data.valid_from,
        valid_to: data.valid_to,
        rfc: data.rfc,
      });
      setCerFile(null);
      setKeyFile(null);
      setPassword("");
      setConsentGiven(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["company-profile"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No pudimos guardar el CSD";
      setError(message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  return {
    cerFile,
    setCerFile,
    keyFile,
    setKeyFile,
    password,
    setPassword,
    consentGiven,
    setConsentGiven,
    saving,
    error,
    fieldError,
    result,
    hasExistingFiles,
    canSave,
    save,
  };
}
