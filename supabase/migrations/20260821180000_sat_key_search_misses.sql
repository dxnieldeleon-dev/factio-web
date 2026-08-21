-- Instrumentación del fallback "No existe en el catálogo" (01010101) de
-- COMMON_SAT_KEYS (src/lib/sat-catalogs.ts): registra qué texto buscaba el
-- usuario cuando no encontró su giro en el catálogo curado, para decidir
-- con evidencia real de uso qué claves agregar más adelante. Es telemetría
-- pura — el usuario nunca lee, edita ni borra sus propios registros, solo
-- inserta.
CREATE TABLE public.sat_key_search_misses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  context text NOT NULL CHECK (context IN ('product_new', 'product_edit', 'invoice_new')),
  search_term text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sat_key_search_misses ENABLE ROW LEVEL SECURITY;

-- Los usuarios solo pueden insertar sus propios registros; nunca leerlos,
-- editarlos ni borrarlos (es telemetría, no un dato que deban administrar).
CREATE POLICY "Users can log their own misses" ON public.sat_key_search_misses
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

GRANT INSERT ON public.sat_key_search_misses TO authenticated;
GRANT ALL ON public.sat_key_search_misses TO service_role;

CREATE INDEX sat_key_search_misses_term_idx ON public.sat_key_search_misses(lower(search_term));
CREATE INDEX sat_key_search_misses_created_idx ON public.sat_key_search_misses(created_at DESC);
