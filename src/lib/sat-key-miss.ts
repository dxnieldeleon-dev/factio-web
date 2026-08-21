// Registra en sat_key_search_misses qué texto buscaba el usuario cuando
// eligió el código comodín de COMMON_SAT_KEYS (01010101, "No existe en el
// catálogo") — telemetría para decidir con evidencia real qué claves
// agregar al catálogo curado más adelante. Fire-and-forget a propósito: el
// guardado del producto/factura nunca debe esperar ni fallar por esto, así
// que ningún caller debe hacer `await` sobre esta función.
import { supabase } from "@/integrations/supabase/client";

export type SatKeyMissContext = "product_new" | "product_edit" | "invoice_new";

export function logSatKeySearchMiss(context: SatKeyMissContext, searchTerm: string): void {
  const term = searchTerm.trim().slice(0, 200);
  if (!term) return;

  void (async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;

      const { data: company } = await supabase
        .from("companies")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const { error } = await supabase.from("sat_key_search_misses").insert({
        user_id: user.id,
        company_id: company?.id ?? null,
        context,
        search_term: term,
      });
      if (error) console.error("sat_key_search_misses insert failed", error);
    } catch (cause) {
      console.error("sat_key_search_misses insert failed", cause);
    }
  })();
}
