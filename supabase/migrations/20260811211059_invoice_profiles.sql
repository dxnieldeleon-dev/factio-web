-- ============ INVOICE PROFILES (defaults por emisor) ============
-- La mayoría de los emisores factura siempre con la misma combinación de
-- Tipo de Comprobante / Exportación / Moneda / Método de pago / Forma de
-- pago (ej. Ingreso · PUE · Transferencia · MXN). Esta tabla guarda esa
-- combinación por emisor para precargarla en el wizard de nueva factura
-- y poder mostrar esos campos colapsados en vez de repetirlos siempre.
--
-- Se ancla a company_id (no a user_id) porque el emisor es la identidad
-- fiscal real detrás de "Tipo de Comprobante"/"Forma de pago" — ver
-- ADR-004. Hoy la app trata companies como 1:1 con el usuario, pero
-- anclar aquí evita tener que migrar esta tabla si eso cambia.
--
-- is_default permite que un emisor tenga más de un perfil a futuro (ej.
-- "Servicios" vs "Venta de producto"); el MVP solo usa un perfil default
-- por emisor, reforzado por el índice único parcial de abajo. No hay UI
-- para múltiples perfiles todavía.
CREATE TABLE public.invoice_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cfdi_type text NOT NULL DEFAULT 'I',
  export_code text NOT NULL DEFAULT '01',
  -- Restringido a MXN a nivel de aplicación (no aquí) porque el proyecto
  -- no tiene fuente de tipo de cambio en vivo (ver src/lib/duplicate-invoice.ts) —
  -- un CHECK aquí obligaría a otra migración el día que se resuelva ese gap.
  currency text NOT NULL DEFAULT 'MXN',
  payment_method text NOT NULL DEFAULT 'PUE',
  payment_form text NOT NULL DEFAULT '03',
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_profiles TO authenticated;
GRANT ALL ON public.invoice_profiles TO service_role;
ALTER TABLE public.invoice_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages invoice_profiles" ON public.invoice_profiles FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER invoice_profiles_updated_at BEFORE UPDATE ON public.invoice_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX invoice_profiles_user_idx ON public.invoice_profiles(user_id);
CREATE UNIQUE INDEX invoice_profiles_one_default_per_company
  ON public.invoice_profiles(company_id) WHERE is_default;
