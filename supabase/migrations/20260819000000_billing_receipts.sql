-- Receipt detail page backing the subscription.activated/subscription.renewed
-- Resend events (see stripe-webhook/index.ts): a durable, per-charge record
-- so receipt_url in those events can point to something real instead of a
-- placeholder or an invented route. Only written by the webhook
-- (service_role, bypasses RLS) — authenticated users only ever read their
-- own company's receipts, never insert/update/delete.
CREATE TABLE public.billing_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stripe_invoice_id text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('activation', 'renewal')),
  plan_name text NOT NULL,
  cfdi_limit integer NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own receipts" ON public.billing_receipts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = billing_receipts.company_id AND c.user_id = auth.uid()
    )
  );

GRANT SELECT ON public.billing_receipts TO authenticated;
GRANT ALL ON public.billing_receipts TO service_role;
