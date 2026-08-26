-- Consentimiento legal: aceptación de Términos/Privacidad al registrarse
-- (por usuario, en settings) y autorización explícita de uso del CSD
-- (por empresa, en companies, ya que el CSD es un dato de la empresa).
ALTER TABLE public.settings
  ADD COLUMN terms_accepted_at timestamptz,
  ADD COLUMN privacy_accepted_at timestamptz;

ALTER TABLE public.companies
  ADD COLUMN csd_usage_consent_at timestamptz;
