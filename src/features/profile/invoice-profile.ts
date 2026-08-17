import { supabase } from "@/integrations/supabase/client";

// Defaults de facturación por emisor — ver ADR-004. Se ancla a company_id,
// no a user_id, porque el emisor (no la cuenta) es quien tiene un Tipo de
// Comprobante/Forma de pago habitual.
export type InvoiceProfile = {
  id: string;
  company_id: string;
  cfdi_type: string;
  export_code: string;
  currency: string;
  payment_method: string;
  payment_form: string;
};

export type InvoiceProfileValues = {
  cfdi_type: string;
  export_code: string;
  currency: string;
  payment_method: string;
  payment_form: string;
};

const SELECT_COLUMNS =
  "id, company_id, cfdi_type, export_code, currency, payment_method, payment_form";

export async function loadInvoiceProfile(companyId: string): Promise<InvoiceProfile | null> {
  const { data, error } = await supabase
    .from("invoice_profiles")
    .select(SELECT_COLUMNS)
    .eq("company_id", companyId)
    .eq("is_default", true)
    .maybeSingle();
  if (error) throw error;
  return data as InvoiceProfile | null;
}

// Upsert manual (en vez de .upsert() con onConflict) porque el índice único
// que protege "un solo default por emisor" es parcial (WHERE is_default),
// y Postgres no puede inferir ON CONFLICT contra un índice parcial sin
// repetir su predicado — más simple y explícito hacer select-then-write.
export async function saveInvoiceProfile(
  userId: string,
  companyId: string,
  values: InvoiceProfileValues,
): Promise<InvoiceProfile> {
  const { data: existing, error: existingError } = await supabase
    .from("invoice_profiles")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_default", true)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { data, error } = await supabase
      .from("invoice_profiles")
      .update(values)
      .eq("id", existing.id)
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw error;
    return data as InvoiceProfile;
  }

  const { data, error } = await supabase
    .from("invoice_profiles")
    .insert({ user_id: userId, company_id: companyId, is_default: true, ...values })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return data as InvoiceProfile;
}
