-- Durable receipt of signed refund notifications. Amounts are snapshots, not
-- increments: never sum these rows to calculate refunds for a charge.
CREATE TABLE public.stripe_refund_events (
  event_id text PRIMARY KEY CHECK (event_id LIKE 'evt_%'),
  charge_id text NOT NULL,
  payment_intent_id text,
  amount_refunded_cents bigint NOT NULL CHECK (amount_refunded_cents >= 0),
  charge_amount_cents bigint NOT NULL CHECK (charge_amount_cents >= amount_refunded_cents),
  currency text NOT NULL CHECK (length(currency) = 3),
  fully_refunded boolean NOT NULL,
  livemode boolean NOT NULL,
  event_created_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  reconciliation_state text NOT NULL DEFAULT 'pending' CHECK (reconciliation_state IN ('pending','completed')),
  reconciled_at timestamptz,
  CHECK ((reconciliation_state = 'completed') = (reconciled_at IS NOT NULL))
);
ALTER TABLE public.stripe_refund_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_refund_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.stripe_refund_events TO service_role;
CREATE INDEX stripe_refund_events_pending ON public.stripe_refund_events(received_at) WHERE reconciliation_state='pending';
CREATE INDEX stripe_refund_events_charge ON public.stripe_refund_events(charge_id);
