CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE,
  event_type text NOT NULL CHECK (event_type IN ('payment','refund','failed','cancellation','cancellation_scheduled','course_completed')),
  livemode boolean NOT NULL,
  occurred_at timestamptz NOT NULL,
  user_id uuid,
  member_email text,
  member_name text,
  product_id uuid,
  product_name text,
  billing_shape text,
  term_months integer,
  amount_cents integer,
  currency text,
  fee_cents integer,
  net_cents integer,
  status text,
  stripe_charge_id text,
  stripe_invoice_id text,
  stripe_subscription_id text,
  stripe_customer_id text,
  stripe_object_id text,
  stripe_event_id text,
  invitation_id uuid,
  referring_practitioner_id uuid,
  source text NOT NULL DEFAULT 'webhook',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_mode_date_idx ON public.payments (livemode, occurred_at);
CREATE INDEX payments_charge_idx ON public.payments (stripe_charge_id);
CREATE INDEX payments_sub_idx ON public.payments (stripe_subscription_id);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read payments" ON public.payments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.payment_subscriptions (
  stripe_subscription_id text PRIMARY KEY,
  livemode boolean NOT NULL,
  user_id uuid,
  member_email text,
  member_name text,
  stripe_customer_id text,
  product_id uuid,
  product_name text,
  billing_shape text,
  term_months integer,
  amount_cents integer,
  currency text,
  billing_interval text,
  interval_count integer DEFAULT 1,
  status text,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  cancel_at timestamptz,
  canceled_at timestamptz,
  started_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_subscriptions TO authenticated;
GRANT ALL ON public.payment_subscriptions TO service_role;
ALTER TABLE public.payment_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read payment subscriptions" ON public.payment_subscriptions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.payments_touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER payments_touch BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.payments_touch_updated_at();
CREATE TRIGGER payment_subscriptions_touch BEFORE UPDATE ON public.payment_subscriptions FOR EACH ROW EXECUTE FUNCTION public.payments_touch_updated_at();