-- Factura Global (venta a público en general): columnas para el nodo
-- GlobalInformation del CFDI 4.0 (Periodicidad/Meses/Año). Bimestral ("05" en
-- c_Periodicidad del SAT) queda fuera a propósito: esa periodicidad es
-- exclusiva de contribuyentes bajo un régimen de tributación bimestral
-- (antes RIF), un caso que Factio no modela hoy, así que solo se permiten
-- las periodicidades que cualquier régimen puede usar.

ALTER TABLE public.companies
  ADD COLUMN default_global_periodicity text;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_default_global_periodicity_check
  CHECK (default_global_periodicity IS NULL OR default_global_periodicity IN ('01', '02', '03', '04'));

ALTER TABLE public.invoices
  ADD COLUMN is_global boolean NOT NULL DEFAULT false,
  ADD COLUMN global_periodicity text,
  ADD COLUMN global_months text,
  ADD COLUMN global_year integer;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_global_periodicity_check
  CHECK (global_periodicity IS NULL OR global_periodicity IN ('01', '02', '03', '04'));

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_global_months_check
  CHECK (global_months IS NULL OR global_months ~ '^(0[1-9]|1[0-2])$');

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_global_year_check
  CHECK (global_year IS NULL OR global_year BETWEEN 2000 AND 2100);

-- Una factura global siempre trae los tres campos completos; una factura
-- normal nunca los trae — nunca un estado a medias.
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_global_fields_consistency_check
  CHECK (
    (is_global = false AND global_periodicity IS NULL AND global_months IS NULL AND global_year IS NULL)
    OR
    (is_global = true AND global_periodicity IS NOT NULL AND global_months IS NOT NULL AND global_year IS NOT NULL)
  );
